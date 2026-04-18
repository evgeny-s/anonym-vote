/**
 * ResultsScreen — live ring-signature tally.
 *
 * No /faucet/votes endpoint, no deadline, no quorum. Everything
 * comes from the in-browser indexer and is tallied locally via
 * `tallyRemarks` with WASM verification. Each accepted-vote row
 * shows the block hash, the extrinsic signer (a throwaway gas
 * address, not the voter's real account), and the key image — the
 * only stable per-voter identifier observers can see. Key images
 * prove "same voter wrote these two remarks" but cannot be inverted
 * to find the real voter.
 */

import { useEffect, useState } from 'react';
import type { ProposalConfig } from '../proposal';
import type { IndexerSnapshot } from '../hooks/useIndexer';
import type { RingState } from '../hooks/useRing';
import type {
  AcceptedClearVote,
  AcceptedVote,
  InvalidVoteEntry,
  Tally,
} from '@anon-vote/shared';
import { SUBTENSOR_WS } from '../config';

function explorerLink(blockHash: string): string {
  return `https://polkadot.js.org/apps/?rpc=${SUBTENSOR_WS}#/explorer/query/${blockHash}`;
}

function shortHash(h: string): string {
  if (!h) return '';
  return h.length > 14 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h;
}

function shortAddr(a: string): string {
  if (!a) return '';
  return a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
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

export interface ResultsScreenProps {
  indexer: IndexerSnapshot;
  ring: RingState;
  tally: Tally;
  votes: AcceptedVote[];
  clearVotes: AcceptedClearVote[];
  invalidReasons: InvalidVoteEntry[];
  config: ProposalConfig;
}

type VoteRow =
  | { kind: 'anon'; blockNumber: number; choice: string; keyImage: string }
  | {
      kind: 'clear';
      blockNumber: number;
      choice: string;
      realAddress: string;
    };

/**
 * Small explainer modal reachable from the `?` button next to any
 * PUBLIC badge. Same CSS as HowItWorksModal so the style matches
 * without a new stylesheet entry.
 */
function PublicVoteInfoModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="hiw-backdrop" onClick={onClose}>
      <div
        className="hiw-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pv-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hiw-header">
          <h2 id="pv-title" className="hiw-title">
            Why is this vote public?
          </h2>
          <button className="hiw-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="hiw-body">
          <p>
            Anonymous voting relies on a <strong>voting key</strong> saved
            locally in the voter's browser during registration. Without that
            key the voter cannot produce a ring signature and cannot cast an
            anonymous vote on a different device.
          </p>
          <p>
            When that happens, we offer a <strong>clear-vote fallback</strong>:
            the voter signs a plain-text <code>system.remark</code> with their
            real wallet and explicitly confirms that their choice will be
            visible on chain. This is the only way to include a voter who has
            lost access to the original voting key.
          </p>
          <p>
            Public votes are counted exactly like anonymous ones in the Vote
            distribution — the only difference is that the link between the
            real address and the choice is visible to everyone.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ResultsScreen({
  indexer,
  ring,
  tally,
  votes,
  clearVotes,
  invalidReasons,
  config,
}: ResultsScreenProps) {
  const [publicInfoOpen, setPublicInfoOpen] = useState(false);
  const counted = tally.yes + tally.no + tally.abstain;

  // Map key image → block hash so the remark list can deep-link to
  // each accepted vote. We only keep the first occurrence per key
  // image, matching the tally's "first wins" behavior.
  const indexedByKeyImage = new Map<string, number>();
  for (const v of votes) {
    if (!indexedByKeyImage.has(v.sig.key_image)) {
      indexedByKeyImage.set(v.sig.key_image, v.blockNumber);
    }
  }
  const blockHashByNumber = new Map<number, string>();
  for (const r of indexer.remarks) {
    blockHashByNumber.set(r.blockNumber, r.blockHash);
  }

  // Outcome rule: abstain votes count toward YES for the passed /
  // failed decision. The `tally.abstain` bucket still holds the raw
  // count so the distribution chart below shows the real split, but
  // the status metric uses yes + abstain.
  const effectiveYes = tally.yes + tally.abstain;
  let outcome: string;
  if (counted === 0) {
    outcome = 'Pending';
  } else if (effectiveYes > tally.no) {
    outcome = 'Passing ✓';
  } else if (tally.no > effectiveYes) {
    outcome = 'Failing ✗';
  } else {
    outcome = 'Tied';
  }

  return (
    <div className="res-root">
      <div className="res-metrics">
        <div className="res-metric">
          <div className="res-metric-label">Voted</div>
          <div className="res-metric-value">
            {tally.totalVoted}
            <span className="res-metric-denom">
              /{config.allowedVoters.length}
            </span>
          </div>
        </div>
        <div className="res-metric">
          <div className="res-metric-label">Registered</div>
          <div className="res-metric-value">
            {ring.ring.length}
            <span className="res-metric-denom">
              /{config.allowedVoters.length}
            </span>
          </div>
        </div>
        <div className="res-metric">
          <div className="res-metric-label">Invalid</div>
          <div className="res-metric-value">{tally.invalid}</div>
        </div>
        <div className="res-metric">
          <div className="res-metric-label">Status</div>
          <div className="res-metric-value" style={{ fontSize: '1rem' }}>
            {outcome}
          </div>
        </div>
      </div>

      <div className="res-card">
        <div className="res-card-title">Vote distribution</div>
        <Bar label="Yes" count={tally.yes} total={counted} color="#22c55e" />
        <Bar label="No" count={tally.no} total={counted} color="#ef4444" />
        <Bar
          label="Abstain"
          count={tally.abstain}
          total={counted}
          color="#f59e0b"
        />
        {tally.invalid > 0 && (
          <div className="res-invalid">
            <strong>
              {tally.invalid} remark{tally.invalid === 1 ? '' : 's'} not
              counted.
            </strong>
            <ul
              style={{
                margin: '8px 0 0 0',
                padding: '0 0 0 18px',
                fontSize: '12px',
                lineHeight: '1.6',
              }}
            >
              {invalidReasons.map((entry, i) => (
                <li key={i}>
                  block <code>{entry.blockNumber}</code>
                  {entry.rb !== null && (
                    <>
                      {' '}
                      (rb=<code>{entry.rb}</code>)
                    </>
                  )}{' '}
                  — <code>{entry.reason}</code>
                  {entry.detail && <>: {entry.detail}</>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div
          style={{
            fontSize: '12px',
            color: 'var(--text3)',
            marginTop: '12px',
          }}
        >
          Voting is open-ended in v2 — late voters are explicitly supported, so
          this tally keeps updating.
        </div>
      </div>

      {(votes.length > 0 || clearVotes.length > 0) && (
        <div className="res-card">
          <div className="res-card-title">
            Accepted votes ({votes.length + clearVotes.length})
          </div>
          <p className="res-blocks-hint">
            Each row is a <code>system.remark</code> accepted by the tally.
            The <em>key image</em> is the stable per-voter identifier used for
            dedup; different key images mean different voters, but nothing in
            the row reveals which allowlisted account that voter is.
          </p>
          <div className="res-blocks">
            {(() => {
              const rows: VoteRow[] = [
                ...votes.map(
                  (v): VoteRow => ({
                    kind: 'anon',
                    blockNumber: v.blockNumber,
                    choice: v.c,
                    keyImage: v.sig.key_image,
                  }),
                ),
                ...clearVotes.map(
                  (v): VoteRow => ({
                    kind: 'clear',
                    blockNumber: v.blockNumber,
                    choice: v.choice,
                    realAddress: v.realAddress,
                  }),
                ),
              ].sort((a, b) => a.blockNumber - b.blockNumber);

              return rows.map((row) => {
                const blockHash =
                  blockHashByNumber.get(row.blockNumber) ?? '';
                const key =
                  row.kind === 'anon'
                    ? `anon:${row.keyImage}`
                    : `clear:${row.realAddress}:${row.blockNumber}`;
                return (
                  <a
                    key={key}
                    className="res-block-row"
                    href={blockHash ? explorerLink(blockHash) : '#'}
                    target="_blank"
                    rel="noreferrer"
                    title="Open on polkadot.js Apps"
                  >
                    <span className="res-block-num">#{row.blockNumber}</span>
                    <span className="res-block-hash">
                      {row.kind === 'clear'
                        ? shortAddr(row.realAddress)
                        : blockHash
                          ? shortHash(blockHash)
                          : '…'}
                    </span>
                    <span
                      className="res-block-signer"
                      style={{ color: `var(--${row.choice})` }}
                    >
                      {row.choice}
                      {row.kind === 'clear' && (
                        <>
                          <span
                            style={{
                              marginLeft: 8,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: 'rgba(245, 158, 11, 0.18)',
                              color: '#b45309',
                              fontSize: '10px',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                            }}
                          >
                            public
                          </span>
                          <button
                            type="button"
                            aria-label="Why is this vote public?"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setPublicInfoOpen(true);
                            }}
                            style={{
                              all: 'unset',
                              cursor: 'pointer',
                              marginLeft: 6,
                              width: 16,
                              height: 16,
                              borderRadius: '50%',
                              border: '1px solid var(--text3)',
                              color: 'var(--text3)',
                              fontSize: '11px',
                              lineHeight: '14px',
                              textAlign: 'center',
                              fontWeight: 700,
                              display: 'inline-block',
                            }}
                          >
                            ?
                          </button>
                        </>
                      )}
                    </span>
                    <span className="res-block-arrow">↗</span>
                  </a>
                );
              });
            })()}
          </div>
        </div>
      )}

      <PublicVoteInfoModal
        open={publicInfoOpen}
        onClose={() => setPublicInfoOpen(false)}
      />
    </div>
  );
}
