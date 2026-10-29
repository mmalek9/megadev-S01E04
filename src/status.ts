import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import type { RunStatus } from './digest/types.js';
import { lastBeat, type Beat } from './heartbeat.js';

// Counts of jobs by their last status on that night (not of log lines).
export type NightCounts = Record<RunStatus, number>;

export type NightOnBoard = {
  night: string;
  counts: NightCounts | null; // null when the night's file cannot be read
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightOnBoard[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function nightCounts(runsDir: string, night: string): NightCounts | null {
  const n = readNight(runsDir, night);
  if (!n) return null;
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const row of n.rows) counts[row.lastStatus]++;
  return counts;
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((night) => ({
      night,
      counts: nightCounts(config.runsDir, night),
    })),
  };
}
