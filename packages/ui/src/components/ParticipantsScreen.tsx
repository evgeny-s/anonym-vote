import { SUBTENSOR_WS } from '../config';
import type { AnnounceMeta } from '../hooks/useRing';
import { useVoterIdentities } from '../hooks/useVoterIdentities';

function shortAddr(addr: string) {
  return addr.slice(0, 8) + '…' + addr.slice(-6);
}

function explorerLink(blockHash: string): string {
  return `https://polkadot.js.org/apps/?rpc=${SUBTENSOR_WS}#/explorer/query/${blockHash}`;
}

interface Props {
  voters: string[];
  totalVoted: number;
  /**
   * Per-voter announce record as observed by the live indexer.
   * Voters missing from this map either haven't registered yet or
   * the indexer hasn't scanned their announce block yet. We render
   * both cases identically ("Not registered") — it's the correct
   * UI stance given we can't distinguish them without knowing
   * indexer progress per voter.
   */
  announcedAt: Map<string, AnnounceMeta>;
}

/**
 * Senate view. For each allowlisted hotkey we display:
 *   - Identity name from SubtensorModule.identitiesV2 (keyed on the
 *     coldkey derived via SubtensorModule.owner(hotkey)).
 *   - Registration status: Registered (with a deep-link to the
 *     announce block on polkadot.js Apps) or Not registered.
 *
 * We deliberately do NOT show per-voter vote status. The protocol
 * hides which ring member signed a given vote by design; only
 * aggregate totals (shown in the header and on the Results screen)
 * are knowable.
 */
export default function ParticipantsScreen({
  voters,
  totalVoted,
  announcedAt,
}: Props) {
  const identities = useVoterIdentities(voters);

  const anyResolved =
    !identities.loading &&
    Array.from(identities.byHotkey.values()).some(
      (i) => i.name !== null || i.coldkey !== null,
    );
  const emptyResult =
    !identities.loading &&
    !identities.error &&
    voters.length > 0 &&
    !anyResolved;

  const registeredCount = voters.filter((v) => announcedAt.has(v)).length;

  return (
    <div className="part-root">
      <div className="part-summary">
        <span className="part-pill voted">{totalVoted} voted</span>
        <span className="part-pill registered">
          {registeredCount} registered
        </span>
        <span className="part-pill total">{voters.length} total</span>
      </div>

      <div className="part-list">
        {voters.map((addr) => {
          const ident = identities.byHotkey.get(addr);
          const name = ident?.name ?? null;
          const announce = announcedAt.get(addr);

          return (
            <div key={addr} className="part-row">
              <div
                className="part-avatar"
                style={{ background: 'var(--bg3)', color: 'var(--text3)' }}
              >
                {name ? name.slice(0, 1).toUpperCase() : '?'}
              </div>
              <div className="part-addr">
                <div className="part-identity">
                  {identities.loading && !ident ? (
                    <span className="part-identity-loading">resolving…</span>
                  ) : name ? (
                    <span className="part-identity-name">{name}</span>
                  ) : (
                    <span className="part-identity-unknown">unknown</span>
                  )}
                </div>
                <span className="part-addr-full">{addr}</span>
                <span className="part-addr-short">{shortAddr(addr)}</span>
              </div>
              <div className="part-status">
                {announce ? (
                  <a
                    className="part-status-badge registered"
                    href={explorerLink(announce.blockHash)}
                    target="_blank"
                    rel="noreferrer"
                    title={`Announce block ${announce.blockNumber} — open on polkadot.js Apps`}
                  >
                    <span className="part-status-icon">✓</span>
                    <span className="part-status-label">Registered</span>
                    <span className="part-status-block">
                      #{announce.blockNumber}
                    </span>
                  </a>
                ) : (
                  <span
                    className="part-status-badge not-registered"
                    title="No announce remark observed on chain yet"
                  >
                    <span className="part-status-icon">○</span>
                    <span className="part-status-label">Not registered</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {identities.error && (
        <div className="part-error">
          Identity resolution failed: <code>{identities.error}</code>. Hotkeys
          are still authoritative; this only affects display.
        </div>
      )}
      {emptyResult && (
        <div className="part-hint">
          None of these addresses have on-chain identity data on the configured
          RPC. Hotkeys that aren't registered as Subtensor validators don't have
          a coldkey mapping or an <code>identitiesV2</code> record, so the UI
          shows "unknown" — the voting flow itself is unaffected.
        </div>
      )}

      <div className="res-privacy" style={{ marginTop: '1.5rem' }}>
        <div className="res-privacy-title">What's public vs private</div>
        <p>
          <strong>Public:</strong> the list of eligible voters, every announced
          voting key, and every vote remark published on chain. Per-voter{' '}
          <em>registration</em> (the block-linked badge above) is public —
          announces are signed by the voter's real wallet.
          <br />
          <strong>Private:</strong> which ring member signed a given vote. Each
          vote is ring-signed by a voting key the voter announced earlier, then
          published by a throwaway gas wallet that is unrelated to their real
          account. On-chain data never links a choice back to a real voter —
          which is why per-voter <em>vote status</em> is not shown anywhere.
        </p>
      </div>
    </div>
  );
}
