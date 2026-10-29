import type { DigestRow, Night } from '../digest/types.js';

// Retries at or above this are flagged (plan § 2a).
const RETRY_FLAG = 3;

function flags(row: DigestRow): string[] {
  const out: string[] = [];
  if (row.retries >= RETRY_FLAG) out.push(`retries ≥${RETRY_FLAG}`);
  if (row.lastStatus === 'fail') out.push('fail');
  return out;
}

export function DigestView({ night, data }: { night: string; data: Night }) {
  return (
    <>
      <h1>digest · {night}</h1>
      {data.badLines > 0 ? (
        <p class="warn">
          {data.badLines} bad {data.badLines === 1 ? 'line' : 'lines'} skipped
        </p>
      ) : null}
      {data.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>status</th>
              <th>error</th>
              <th>first</th>
              <th>last</th>
              <th>flag</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => {
              const marks = flags(row);
              return (
                <tr class={marks.length > 0 ? 'warn' : undefined}>
                  <td>{row.job}</td>
                  <td>{row.owner ?? '—'}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.lastStatus}</td>
                  <td>{row.lastError ?? '—'}</td>
                  <td>{row.first}</td>
                  <td>{row.last}</td>
                  <td>{marks.join(' · ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
