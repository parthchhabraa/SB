/**
 * Fixture data for the design preview only.
 *
 * This exists so the real screens can render with plausible content on a
 * static page with no backend. It is never imported by the application: the
 * product screens are wired to real queries, and the preview build is the only
 * thing that pulls this file in.
 */
import type { Profile } from "@/lib/queries/profile";
import type { Subject, Subtopic } from "@/lib/queries/subjects";

export const profile: Profile = {
  id: "00000000-0000-4000-8000-000000000001",
  handle: "parth",
  display_name: "Parth",
  timezone: "Asia/Kolkata",
  daily_goal_minutes: 240,
  hide_subjects_from_friends: false,
  pomodoro_work_minutes: 50,
  pomodoro_break_minutes: 10,
  pomodoro_long_break_minutes: 20,
  pomodoro_rounds_before_long_break: 3,
};

export const subjects: Subject[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    name: "Maths",
    color: "blue",
    sort_order: 0,
    archived_at: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    name: "Physics",
    color: "cyan",
    sort_order: 1,
    archived_at: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    name: "Organic chemistry",
    color: "green",
    sort_order: 2,
    archived_at: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000104",
    name: "English literature",
    color: "rust",
    sort_order: 3,
    archived_at: null,
  },
];

export const subtopics: Record<string, Subtopic[]> = {
  "00000000-0000-4000-8000-000000000101": [
    {
      id: "00000000-0000-4000-8000-000000000201",
      subject_id: "00000000-0000-4000-8000-000000000101",
      name: "Integration",
      sort_order: 0,
      archived_at: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000202",
      subject_id: "00000000-0000-4000-8000-000000000101",
      name: "Vectors",
      sort_order: 1,
      archived_at: null,
    },
  ],
  "00000000-0000-4000-8000-000000000103": [
    {
      id: "00000000-0000-4000-8000-000000000203",
      subject_id: "00000000-0000-4000-8000-000000000103",
      name: "Aldehydes and ketones",
      sort_order: 0,
      archived_at: null,
    },
  ],
};
