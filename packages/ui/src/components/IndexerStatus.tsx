/**
 * Global chain-sync status strip.
 *
 * Rendered once at the top of the app so every tab shows the same
 * indexer state — the Results tab isn't the only place the user
 * cares about "am I up to date". While catching up, shows a
 * progress bar and a rolling remark count; once `ready`, the
 * component renders nothing (zero vertical space — no layout jump
 * on the healthy path).
 */

import type { IndexerSnapshot } from '../hooks/useIndexer';
import type { ProposalConfig } from '../proposal';

interface Props {
  indexer: IndexerSnapshot;
  config: ProposalConfig;
}

export default function IndexerStatus({ indexer, config }: Props) {
  const scanProgressPct =
    indexer.head !== null && indexer.head > config.startBlock
      ? Math.min(
          100,
          Math.round(
            ((indexer.scannedThrough - config.startBlock + 1) /
              (indexer.head - config.startBlock + 1)) *
              100,
          ),
        )
      : 0;

  if (indexer.status !== 'indexing' && !indexer.error) return null;

  return (
    <>
      {indexer.status === 'indexing' && (
        <div className="res-indexing">
          <div className="res-indexing-row">
            <div className="vs-spinner" style={{ width: 18, height: 18 }} />
            <div>
              <strong>Scanning chain…</strong>
              <p>
                {indexer.remarks.length > 0
                  ? `${indexer.remarks.length} remark(s) seen so far — live updates as new blocks land.`
                  : 'No remarks seen yet — this fills in as blocks are processed.'}
              </p>
            </div>
            <span className="res-indexing-pct">{scanProgressPct}%</span>
          </div>
          <div className="res-progress-track">
            <div
              className="res-progress-fill"
              style={{ width: `${scanProgressPct}%` }}
            />
          </div>
        </div>
      )}

      {indexer.error && (
        <div className="vs-error">
          <p>Indexer error: {indexer.error}</p>
        </div>
      )}
    </>
  );
}
