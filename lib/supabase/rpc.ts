/**
 * Typed wrappers over the database functions.
 *
 * The generated Database type records that these functions exist; their
 * argument and return shapes are declared here, because what a caller wants
 * from an RPC signature is a judgement call rather than a mechanical
 * translation of the catalog. Every response is parsed with Zod, so a schema
 * change shows up as a clear error at the boundary instead of as undefined
 * three components later.
 */
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

const uuid = z.string().uuid();
const ts = z.string();

export const sessionRow = z.object({
  id: uuid,
  user_id: uuid,
  subject_id: uuid,
  subtopic_id: uuid.nullable(),
  mode: z.enum(["stopwatch", "pomodoro"]),
  status: z.enum(["running", "paused", "completed", "discarded"]),
  started_at: ts,
  ended_at: ts.nullable(),
  planned_seconds: z.number().nullable(),
  net_seconds: z.number().nullable(),
  note: z.string().nullable(),
  is_manual: z.boolean(),
  auto_closed: z.boolean(),
  chained_from_session_id: uuid.nullable(),
  created_at: ts,
});
export type SessionRow = z.infer<typeof sessionRow>;

export const activeSession = z.object({
  id: uuid,
  subject_id: uuid,
  subtopic_id: uuid.nullable(),
  mode: z.enum(["stopwatch", "pomodoro"]),
  status: z.enum(["running", "paused"]),
  started_at: ts,
  planned_seconds: z.number().nullable(),
  paused_seconds: z.coerce.number(),
  paused_at: ts.nullable(),
  server_now: ts,
});
export type ActiveSession = z.infer<typeof activeSession>;

export const goalStatusRow = z.object({
  goal_id: uuid,
  scope: z.enum(["daily", "weekly"]),
  subject_id: uuid.nullable(),
  target_minutes: z.number(),
  achieved_seconds: z.coerce.number(),
  met: z.boolean(),
});
export type GoalStatus = z.infer<typeof goalStatusRow>;

export const rewardStatusRow = z.object({
  reward_id: uuid,
  title: z.string(),
  cost_points: z.number(),
  cooldown_hours: z.number().nullable(),
  affordable: z.boolean(),
  cooldown_until: ts.nullable(),
  last_redeemed_at: ts.nullable(),
  times_redeemed: z.number(),
});
export type RewardStatus = z.infer<typeof rewardStatusRow>;

export const leaderboardRow = z.object({
  user_id: uuid,
  handle: z.string(),
  display_name: z.string(),
  seconds: z.coerce.number(),
  is_self: z.boolean(),
  is_studying: z.boolean(),
});
export type LeaderboardRow = z.infer<typeof leaderboardRow>;

export const friendActivityRow = z.object({
  user_id: uuid,
  handle: z.string(),
  display_name: z.string(),
  is_studying: z.boolean(),
  subject_name: z.string().nullable(),
  subject_color: z.string().nullable(),
  started_at: ts.nullable(),
  subjects_hidden: z.boolean(),
  today_seconds: z.coerce.number(),
});
export type FriendActivity = z.infer<typeof friendActivityRow>;

export const daySecondsRow = z.object({
  local_date: z.string(),
  seconds: z.coerce.number(),
});

export const daySubjectSecondsRow = z.object({
  local_date: z.string(),
  subject_id: uuid.nullable(),
  seconds: z.coerce.number(),
});

/**
 * Turns a Postgres error into something a person can act on.
 *
 * The RPCs raise with a `hint` naming the condition, so the message shown can
 * say what broke and what to do rather than surfacing a constraint name.
 */
export class RpcError extends Error {
  readonly hint: string | undefined;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = "RpcError";
    this.hint = hint;
  }
}

type PgError = { message: string; hint?: string | null; code?: string | null };

function fail(error: PgError): never {
  throw new RpcError(error.message, error.hint ?? undefined);
}

// Generic over the function name so that a typo, or a function removed from a
// migration, fails the build rather than at runtime. The generated Functions
// map is deliberately loose about argument shapes; the shapes that matter are
// spelled out in the wrappers below.
type FnName = keyof Database["public"]["Functions"];

async function callRpc<N extends FnName>(
  client: Client,
  name: N,
  args: Record<string, unknown>,
): Promise<unknown> {
  // The Args generic defaults to never, so it is supplied explicitly rather
  // than inferred from a value typed only as a record.
  const { data, error } = await client.rpc<N, Record<string, unknown>>(name, args);
  if (error) fail(error);
  return data;
}

async function rpc<T, N extends FnName>(
  client: Client,
  name: N,
  args: Record<string, unknown>,
  shape: z.ZodType<T>,
): Promise<T> {
  return shape.parse(await callRpc(client, name, args));
}

export const api = {
  serverNow: (c: Client) => rpc(c, "server_now", {}, z.string()),

  activeSession: async (c: Client): Promise<ActiveSession | null> => {
    const rows = await rpc(c, "active_session", {}, z.array(activeSession));
    return rows[0] ?? null;
  },

  startSession: (
    c: Client,
    args: {
      subjectId: string;
      subtopicId?: string | null;
      mode?: "stopwatch" | "pomodoro";
      plannedSeconds?: number | null;
    },
  ) =>
    rpc(c, "start_session", {
      p_subject_id: args.subjectId,
      p_subtopic_id: args.subtopicId ?? null,
      p_mode: args.mode ?? "stopwatch",
      p_planned_seconds: args.plannedSeconds ?? null,
    }, sessionRow),

  pauseSession: (c: Client, id: string) =>
    rpc(c, "pause_session", { p_session_id: id }, sessionRow),

  resumeSession: (c: Client, id: string) =>
    rpc(c, "resume_session", { p_session_id: id }, sessionRow),

  completeSession: (c: Client, id: string, clientEndedAt?: string) =>
    rpc(c, "complete_session", {
      p_session_id: id,
      p_client_ended_at: clientEndedAt ?? null,
    }, sessionRow),

  discardSession: (c: Client, id: string) =>
    rpc(c, "discard_session", { p_session_id: id }, sessionRow),

  undoDiscardSession: (c: Client, id: string) =>
    rpc(c, "undo_discard_session", { p_session_id: id }, sessionRow),

  switchSubject: (
    c: Client,
    args: { sessionId: string; subjectId: string; subtopicId?: string | null },
  ) =>
    rpc(c, "switch_session_subject", {
      p_session_id: args.sessionId,
      p_subject_id: args.subjectId,
      p_subtopic_id: args.subtopicId ?? null,
    }, sessionRow),

  addManualSession: (
    c: Client,
    args: {
      subjectId: string;
      startedAt: string;
      endedAt: string;
      subtopicId?: string | null;
      note?: string | null;
    },
  ) =>
    rpc(c, "add_manual_session", {
      p_subject_id: args.subjectId,
      p_started_at: args.startedAt,
      p_ended_at: args.endedAt,
      p_subtopic_id: args.subtopicId ?? null,
      p_note: args.note ?? null,
    }, sessionRow),

  completeOnboarding: (
    c: Client,
    args: {
      handle: string;
      displayName: string;
      timezone: string;
      dailyGoalMinutes: number;
    },
  ) =>
    callRpc(c, "complete_onboarding", {
      p_handle: args.handle,
      p_display_name: args.displayName,
      p_timezone: args.timezone,
      p_daily_goal_minutes: args.dailyGoalMinutes,
    }),

  setGoal: (
    c: Client,
    args: { scope: "daily" | "weekly"; targetMinutes: number; subjectId?: string | null },
  ) =>
    callRpc(c, "set_goal", {
      p_scope: args.scope,
      p_target_minutes: args.targetMinutes,
      p_subject_id: args.subjectId ?? null,
    }),

  clearGoal: (c: Client, scope: "daily" | "weekly", subjectId?: string | null) =>
    callRpc(c, "clear_goal", { p_scope: scope, p_subject_id: subjectId ?? null }),

  goalStatus: (c: Client) =>
    rpc(c, "goal_status", {}, z.array(goalStatusRow)),

  currentStreak: (c: Client, userId: string) =>
    rpc(c, "current_streak", { p_user: userId }, z.number()),

  pointBalance: (c: Client, userId: string) =>
    rpc(c, "point_balance", { p_user: userId }, z.number()),

  rewardStatus: (c: Client) =>
    rpc(c, "reward_status", {}, z.array(rewardStatusRow)),

  redeemReward: (c: Client, rewardId: string) =>
    callRpc(c, "redeem_reward", { p_reward_id: rewardId }),

  dayTotals: (c: Client, userId: string, from: string, to: string) =>
    rpc(c, "user_day_seconds", { p_user: userId, p_from: from, p_to: to },
      z.array(daySecondsRow)),

  daySubjectTotals: (c: Client, userId: string, from: string, to: string) =>
    rpc(c, "user_day_subject_seconds", { p_user: userId, p_from: from, p_to: to },
      z.array(daySubjectSecondsRow)),

  userToday: (c: Client, userId: string) =>
    rpc(c, "user_today", { p_user: userId }, z.string()),

  findByHandle: (c: Client, handle: string) =>
    rpc(c, "find_profile_by_handle", { p_handle: handle },
      z.array(z.object({
        id: uuid,
        handle: z.string(),
        display_name: z.string(),
        friendship_status: z.string(),
      }))),

  sendFriendRequest: (c: Client, handle: string) =>
    callRpc(c, "send_friend_request", { p_handle: handle }),

  respondToRequest: (c: Client, friendshipId: string, accept: boolean) =>
    callRpc(c, "respond_to_friend_request", {
      p_friendship_id: friendshipId,
      p_accept: accept,
    }),

  removeFriend: (c: Client, friendshipId: string) =>
    callRpc(c, "remove_friend", { p_friendship_id: friendshipId }),

  pendingRequests: (c: Client) =>
    rpc(c, "pending_friend_requests", {},
      z.array(z.object({
        friendship_id: uuid,
        user_id: uuid,
        handle: z.string(),
        display_name: z.string(),
        created_at: ts,
        direction: z.enum(["incoming", "outgoing"]),
      }))),

  friendActivity: (c: Client) =>
    rpc(c, "friend_activity", {}, z.array(friendActivityRow)),

  leaderboard: (c: Client, range: "today" | "week" | "all") =>
    rpc(c, "friend_leaderboard", { p_range: range }, z.array(leaderboardRow)),
} as const;
