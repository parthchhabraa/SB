export const qk = {
  profile: ["profile"] as const,
  subjects: ["subjects"] as const,
  subtopics: (subjectId: string) => ["subtopics", subjectId] as const,
  activeSession: ["active-session"] as const,
  todaySeconds: ["today-seconds"] as const,
  dayTotals: (from: string, to: string) => ["day-totals", from, to] as const,
  goals: ["goals"] as const,
  rewards: ["rewards"] as const,
  balance: ["balance"] as const,
  friends: ["friends"] as const,
  leaderboard: (range: string) => ["leaderboard", range] as const,
} as const;
