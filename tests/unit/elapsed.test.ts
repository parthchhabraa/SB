import { beforeEach, describe, expect, it } from "vitest";
import {
  clockDigits,
  elapsedSeconds,
  formatDuration,
  pausedSeconds,
  pomodoroPhase,
  toClock,
  type TimerState,
} from "@/lib/time/elapsed";
import {
  clockOffsetMs,
  recordOffsetSample,
  resetClockOffset,
  serverNow,
} from "@/lib/time/clock";

const t = (iso: string) => new Date(iso).getTime();

function running(startedAt: string, closedPaused = 0): TimerState {
  return {
    startedAt: t(startedAt),
    closedPausedSeconds: closedPaused,
    pausedAt: null,
    plannedSeconds: null,
  };
}

describe("elapsedSeconds", () => {
  it("is the gap between start and now", () => {
    const state = running("2026-03-10T09:00:00Z");
    expect(elapsedSeconds(state, t("2026-03-10T09:30:00Z"))).toBe(1800);
  });

  it("subtracts pauses that have ended", () => {
    const state = running("2026-03-10T09:00:00Z", 600);
    expect(elapsedSeconds(state, t("2026-03-10T09:30:00Z"))).toBe(1200);
  });

  it("holds still while paused, however long the tab stays open", () => {
    const state: TimerState = {
      startedAt: t("2026-03-10T09:00:00Z"),
      closedPausedSeconds: 0,
      pausedAt: t("2026-03-10T09:10:00Z"),
      plannedSeconds: null,
    };

    // The same value an hour later. This is the case the first version of the
    // active_session RPC got wrong by folding the open pause into its total.
    expect(elapsedSeconds(state, t("2026-03-10T09:10:01Z"))).toBe(600);
    expect(elapsedSeconds(state, t("2026-03-10T10:10:00Z"))).toBe(600);
    expect(elapsedSeconds(state, t("2026-03-10T23:00:00Z"))).toBe(600);
  });

  it("is unchanged by how long the page was away", () => {
    const state = running("2026-03-10T09:00:00Z");

    // A refresh, a backgrounded tab and a sleeping laptop are all just a
    // later `now`. Nothing accumulates, so nothing can fall behind.
    const oneMinuteIn = elapsedSeconds(state, t("2026-03-10T09:01:00Z"));
    const sixHoursIn = elapsedSeconds(state, t("2026-03-10T15:00:00Z"));

    expect(oneMinuteIn).toBe(60);
    expect(sixHoursIn).toBe(6 * 3600);
  });

  it("survives a session left running for fourteen hours", () => {
    const state = running("2026-03-10T20:00:00Z");
    expect(elapsedSeconds(state, t("2026-03-11T10:00:00Z"))).toBe(14 * 3600);
  });

  it("crosses midnight without noticing, because it counts seconds not days", () => {
    const state = running("2026-03-10T23:30:00Z");
    expect(elapsedSeconds(state, t("2026-03-11T00:45:00Z"))).toBe(75 * 60);
  });

  it("is unaffected by a daylight saving transition", () => {
    // 01:30 to 03:30 local on the spring forward night in New York is one
    // wall clock hour, because 02:00 does not exist. The timer measures
    // instants, so it reports the hour that actually passed.
    const state = running("2026-03-08T06:30:00Z");
    expect(elapsedSeconds(state, t("2026-03-08T07:30:00Z"))).toBe(3600);
  });

  it("never goes negative when the clock moves backwards", () => {
    const state = running("2026-03-10T09:00:00Z");
    expect(elapsedSeconds(state, t("2026-03-10T08:00:00Z"))).toBe(0);
  });

  it("never goes negative when pauses exceed the span", () => {
    const state = running("2026-03-10T09:00:00Z", 99_999);
    expect(elapsedSeconds(state, t("2026-03-10T09:30:00Z"))).toBe(0);
  });
});

describe("pausedSeconds", () => {
  it("counts an open pause as it grows", () => {
    const state: TimerState = {
      startedAt: t("2026-03-10T09:00:00Z"),
      closedPausedSeconds: 120,
      pausedAt: t("2026-03-10T09:10:00Z"),
      plannedSeconds: null,
    };
    expect(pausedSeconds(state, t("2026-03-10T09:15:00Z"))).toBe(120 + 300);
  });

  it("is just the closed total while running", () => {
    expect(pausedSeconds(running("2026-03-10T09:00:00Z", 90), t("2026-03-10T09:30:00Z")))
      .toBe(90);
  });
});

describe("pomodoroPhase", () => {
  const work = (startedAt: string, planned: number): TimerState => ({
    startedAt: t(startedAt),
    closedPausedSeconds: 0,
    pausedAt: null,
    plannedSeconds: planned,
  });

  it("is null for a stopwatch session", () => {
    expect(pomodoroPhase(running("2026-03-10T09:00:00Z"), t("2026-03-10T09:01:00Z")))
      .toBeNull();
  });

  it("counts down from the planned length", () => {
    const phase = pomodoroPhase(work("2026-03-10T09:00:00Z", 1500), t("2026-03-10T09:10:00Z"));
    expect(phase?.remainingSeconds).toBe(900);
    expect(phase?.complete).toBe(false);
    expect(phase?.progress).toBeCloseTo(0.4);
  });

  it("reports a phase that ended while the tab was hidden", () => {
    // The boundary is derived, not scheduled, so nothing had to fire for this
    // to be true when the tab comes back.
    const phase = pomodoroPhase(work("2026-03-10T09:00:00Z", 1500), t("2026-03-10T11:00:00Z"));
    expect(phase?.complete).toBe(true);
    expect(phase?.remainingSeconds).toBe(0);
    expect(phase?.progress).toBe(1);
  });

  it("pushes the boundary out by however long the session was paused", () => {
    const paused: TimerState = {
      startedAt: t("2026-03-10T09:00:00Z"),
      closedPausedSeconds: 600,
      pausedAt: null,
      plannedSeconds: 1500,
    };
    // Ten minutes of pause means the 25 minute phase ends at 09:35, not 09:25.
    expect(pomodoroPhase(paused, t("2026-03-10T09:25:00Z"))?.complete).toBe(false);
    expect(pomodoroPhase(paused, t("2026-03-10T09:35:00Z"))?.complete).toBe(true);
  });
});

describe("clock face", () => {
  it("splits into hours, minutes and seconds", () => {
    expect(toClock(3661)).toEqual({ hours: 1, minutes: 1, seconds: 1 });
  });

  it("does not roll over past a day", () => {
    expect(toClock(30 * 3600)).toEqual({ hours: 30, minutes: 0, seconds: 0 });
  });

  it("omits the hour pair until there is an hour to show", () => {
    expect(clockDigits(59).join("")).toBe("00:59");
    expect(clockDigits(3599).join("")).toBe("59:59");
    expect(clockDigits(3600).join("")).toBe("01:00:00");
  });

  it("gives one cell per character, so a single digit can move alone", () => {
    expect(clockDigits(61)).toEqual(["0", "1", ":", "0", "1"]);
  });

  it("formats durations for totals", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(600)).toBe("10m");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(4 * 3600 + 12 * 60)).toBe("4h 12m");
  });
});

describe("server clock offset", () => {
  beforeEach(resetClockOffset);

  it("corrects a device clock that is an hour fast", () => {
    const deviceNow = t("2026-03-10T10:00:00Z");
    const trueNow = t("2026-03-10T09:00:00Z");

    const accepted = recordOffsetSample({
      sentAt: deviceNow,
      receivedAt: deviceNow + 100,
      serverTime: trueNow + 50,
    });

    expect(accepted).toBe(true);
    expect(clockOffsetMs()).toBe(-3_600_000);
    expect(Math.abs(serverNow() - (Date.now() - 3_600_000))).toBeLessThan(50);
  });

  it("splits the round trip rather than blaming one leg", () => {
    const sentAt = 1_000_000;
    recordOffsetSample({ sentAt, receivedAt: sentAt + 200, serverTime: sentAt + 100 });
    // The server's timestamp matches the midpoint exactly, so there is no skew.
    expect(clockOffsetMs()).toBe(0);
  });

  it("discards a reading from too slow a round trip", () => {
    const sentAt = 1_000_000;
    const accepted = recordOffsetSample({
      sentAt,
      receivedAt: sentAt + 30_000,
      serverTime: sentAt + 500_000,
    });
    expect(accepted).toBe(false);
    expect(clockOffsetMs()).toBe(0);
  });

  it("discards a reading that appears to arrive before it was sent", () => {
    expect(
      recordOffsetSample({ sentAt: 2_000, receivedAt: 1_000, serverTime: 5_000 }),
    ).toBe(false);
  });
});
