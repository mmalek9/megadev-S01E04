import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';

// Nights live in a temp dir; runs/ is read-only and never touched here.
const NORMAL = '2026-10-28';
const EMPTY = '2026-10-27';
const BAD = '2026-10-26';
const MISSING = '2000-01-01';

type DigestJson = { night: string; rows: { job: string }[]; badLines: number };

const entry = (job: string, status: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ at: '2026-10-28T01:00:00+01:00', job, status, owner: 'rook', ...extra });

let runsDir: string;
let config: RigConfig;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  // Lines are deliberately out of job order so the sort is actually exercised.
  writeFileSync(
    join(runsDir, `${NORMAL}.jsonl`),
    [
      entry('lane/sync', 'ok'),
      entry('notes/backup', 'fail', { error: 'quota exceeded' }),
      entry('fixtures/refresh', 'retry', { error: 'upstream 503' }),
      entry('fixtures/refresh', 'retry', { error: 'upstream 503' }),
      entry('fixtures/refresh', 'ok'),
      entry('digest/render', 'ok', { owner: null }),
    ].join('\n') + '\n',
  );
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(runsDir, `${BAD}.jsonl`),
    [entry('lane/sync', 'ok'), '{not json', entry('digest/render', 'ok')].join('\n') + '\n',
  );
  config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

// Job names in the order they appear in the HTML page.
function jobsInPageOrder(html: string, jobs: string[]): string[] {
  const positions = jobs.map((job) => ({ job, at: html.indexOf(job) }));
  for (const p of positions) expect(p.at, `${p.job} missing from page`).toBeGreaterThanOrEqual(0);
  return positions.sort((a, b) => a.at - b.at).map((p) => p.job);
}

describe('GET /digest/:night', () => {
  it('returns 200 with a table for a normal night', async () => {
    const res = await createApp(config).request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<table');
    expect(html).toContain('lane/sync');
  });

  it('returns 404 for a night with no file', async () => {
    const res = await createApp(config).request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('renders "nothing ran" for an empty night', async () => {
    const res = await createApp(config).request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still returns 200 and lists the good rows when a line is bad', async () => {
    const res = await createApp(config).request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('lane/sync');
    expect(html).toContain('digest/render');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns 200 with night, rows and badLines for a normal night', async () => {
    const res = await createApp(config).request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestJson;
    expect(body.night).toBe(NORMAL);
    expect(body.rows.map((r) => r.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup',
    ]);
    expect(body.badLines).toBe(0);
  });

  it('returns 404 { error: "no such night" } for a night with no file', async () => {
    const res = await createApp(config).request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('returns empty rows for an empty night', async () => {
    const res = await createApp(config).request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestJson;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('returns 200 with badLines 1 when a line is bad', async () => {
    const res = await createApp(config).request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestJson;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['digest/render', 'lane/sync']);
  });
});

describe('page and JSON agree', () => {
  it.each([NORMAL, BAD])('list the same jobs in the same order for %s', async (night) => {
    const app = createApp(config);
    const html = await (await app.request(`/digest/${night}`)).text();
    const body = (await (await app.request(`/api/digest/${night}`)).json()) as DigestJson;
    const jsonJobs = body.rows.map((r) => r.job);
    expect(jsonJobs).toEqual([...jsonJobs].sort((a, b) => a.localeCompare(b)));
    expect(jobsInPageOrder(html, jsonJobs)).toEqual(jsonJobs);
  });
});
