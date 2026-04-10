import type { Tally } from '../crypto';
import type { IndexedRemark, Proposal } from '../faucet';
import { SUBTENSOR_WS } from '../config';

/**
 * Build a polkadot.js Apps explorer link for a given block hash, using
 * the same Subtensor WS endpoint the UI is configured to talk to. The
 * `rpc` query parameter is intentionally NOT URL-encoded — that's the
 * shape polkadot.js apps expects (e.g. the public link in the README).
 */
function explorerLink(blockHash: string): string {
  return `https://polkadot.js.org/apps/?rpc=${SUBTENSOR_WS}#/explorer/query/${blockHash}`;
}

function shortHash(h: string): string {
  if (!h) return '';
  return h.length > 14 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h;
}

function shortAddr(a: string): string {
  if (!a) return '';
  return a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function Bar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="res-bar-row">
      <span className="res-bar-label">{label}</span>
      <div className="res-bar-track">
        <div
          className="res-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="res-bar-count">{count}</span>
      <span className="res-bar-pct">{pct}%</span>
    </div>
  );
}

interface Props {
  tally: Tally | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  progress: { scanned: number; total: number };
  refresh: () => void;
  isPastDeadline: boolean;
  voters: string[];
  proposal: Proposal;
  indexedRemarks: IndexedRemark[];
  indexerStatus: 'indexing' | 'ready' | null;
}

export default function ResultsScreen({
  tally,
  loading,
  refreshing,
  error,
  progress,
  refresh,
  isPastDeadline,
  voters,
  proposal,
  indexedRemarks,
  indexerStatus,
}: Props) {
  if (loading && !tally) {
    const pct =
      progress.total > 0
        ? Math.min(100, Math.round((progress.scanned / progress.total) * 100))
        : 0;
    return (
      <div className="vs-status">
        <div className="vs-spinner" />
        <p>Backend is indexing subtensor blocks…</p>
        {progress.total > 0 && (
          <small>
            {progress.scanned.toLocaleString()} /{' '}
            {progress.total.toLocaleString()} blocks ({pct}%)
          </small>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="vs-error">
        <p>Failed to load: {error}</p>
        <button className="vs-btn-ghost" onClick={refresh}>
          Retry
        </button>
      </div>
    );
  }

  const t: Tally = tally ?? {
    yes: 0,
    no: 0,
    abstain: 0,
    invalid: 0,
    totalVoted: 0,
  };
  const counted = t.yes + t.no + t.abstain;
  const quorum = proposal.quorum;
  const quorumMet = t.totalVoted >= quorum;

  let outcome = 'Pending';
  if (counted > 0) {
    if (!quorumMet) outcome = 'No quorum';
    else if (t.yes > t.no) outcome = 'Passed ✓';
    else if (t.no > t.yes) outcome = 'Rejected ✗';
    else outcome = 'Tied';
  }

  const indexerPct =
    progress.total > 0
      ? Math.min(100, Math.round((progress.scanned / progress.total) * 100))
      : 0;

  return (
    <div className="res-root">
      {indexerStatus === 'indexing' && (
        <div className="res-indexing">
          <div className="res-indexing-row">
            <div className="vs-spinner" style={{ width: 18, height: 18 }} />
            <div>
              <strong>Backend is indexing chain…</strong>
              <p>
                {indexedRemarks.length > 0
                  ? `${indexedRemarks.length} remark(s) indexed so far — the tally below updates live as new blocks land.`
                  : 'No vote remarks indexed yet — the tally below will fill in as blocks are processed.'}
              </p>
            </div>
            <span className="res-indexing-pct">{indexerPct}%</span>
          </div>
          <div className="res-progress-track">
            <div
              className="res-progress-fill"
              style={{ width: `${indexerPct}%` }}
            />
          </div>
        </div>
      )}

      <div className="res-metrics">
        <div className="res-metric">
          <div className="res-metric-label">Voted</div>
          <div className="res-metric-value">
            {t.totalVoted}
            <span className="res-metric-denom">/{voters.length}</span>
          </div>
        </div>
        <div className="res-metric">
          <div className="res-metric-label">Quorum</div>
          <div
            className="res-metric-value"
            style={{ color: quorumMet ? '#22c55e' : 'inherit' }}
          >
            {quorum}
            <span className="res-metric-denom"> req.</span>
          </div>
        </div>
        <div className="res-metric">
          <div className="res-metric-label">Invalid</div>
          <div className="res-metric-value">{t.invalid}</div>
        </div>
        <div className="res-metric">
          <div className="res-metric-label">Outcome</div>
          <div className="res-metric-value" style={{ fontSize: '1rem' }}>
            {outcome}
          </div>
        </div>
      </div>

      <div className="res-card">
        <div className="res-card-title">Vote distribution</div>
        <Bar label="Yes" count={t.yes} total={counted} color="#22c55e" />
        <Bar label="No" count={t.no} total={counted} color="#ef4444" />
        <Bar
          label="Abstain"
          count={t.abstain}
          total={counted}
          color="#f59e0b"
        />
        {t.invalid > 0 && (
          <div className="res-invalid">
            {t.invalid} remark(s) failed credential verification — not counted.
          </div>
        )}
        {!isPastDeadline && (
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text3)',
              marginTop: '12px',
            }}
          >
            Voting is still open. Results update as new remarks land on chain.
          </div>
        )}
      </div>

      {indexedRemarks.length > 0 && (
        <div className="res-card">
          <div className="res-card-title">
            Indexed remark blocks ({indexedRemarks.length})
          </div>
          <p className="res-blocks-hint">
            Every <code>system.remark</code> the backend has indexed since
            block <code>{progress.total > 0 ? `#${proposal.startBlock}` : '…'}</code>.
            Click any block hash to open it in the polkadot.js explorer and
            verify the extrinsic for yourself.
          </p>
          <div className="res-blocks">
            {indexedRemarks.map((r) => (
              <a
                key={`${r.blockNumber}-${r.blockHash}`}
                className="res-block-row"
                href={explorerLink(r.blockHash)}
                target="_blank"
                rel="noreferrer"
                title="Open on polkadot.js Apps"
              >
                <span className="res-block-num">#{r.blockNumber}</span>
                <span className="res-block-hash">{shortHash(r.blockHash)}</span>
                <span className="res-block-signer">
                  {shortAddr(r.signer)}
                </span>
                <span className="res-block-arrow">↗</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="res-privacy">
        <div className="res-privacy-title">Privacy guarantee</div>
        <p>
          Each vote is a <code>system.remark</code> extrinsic signed by a
          one-shot stealth sr25519 account generated in the voter's browser.
          Eligibility is proved by a coordinator signature over the stealth
          address — never by the voter's real wallet. On-chain data contains no
          link between real voters and their choices, and tallying does not
          require that link either.
        </p>
      </div>

      <button
        className="vs-btn-ghost res-refresh"
        onClick={refresh}
        disabled={refreshing}
      >
        {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
      </button>
    </div>
  );
}
