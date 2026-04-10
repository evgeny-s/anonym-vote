import { useState, useEffect, useCallback, useRef } from 'react';
import { tallyRemarks } from '../crypto';
import type { AcceptedVote, Tally } from '../crypto';
import type { IndexedRemark, IndexerSnapshot, Proposal } from '../faucet';
import { getCoordPubkey, getIndexedVotes } from '../faucet';
import { peekStealth } from '../stealth';

/**
 * Auto-poll cadence. Stays fast while the backend is still catching up to
 * head; slows down once it's `ready` so the page still notices new votes
 * (which flip the backend back into `indexing` until they're ingested)
 * without hammering the API.
 */
const INDEXING_POLL_INTERVAL_MS = 3_000;
const READY_POLL_INTERVAL_MS = 8_000;

export function useVotes(
  realAddress: string | null,
  proposal: Proposal | null,
) {
  const [votes, setVotes] = useState<AcceptedVote[]>([]);
  const [tally, setTally] = useState<Tally | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<IndexerSnapshot | null>(null);
  const [alreadyVoted, setAlreadyVoted] = useState(false);

  const proposalId = proposal?.id ?? null;
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotRef = useRef<IndexerSnapshot | null>(null);
  const tickRef = useRef<(() => Promise<void>) | null>(null);

  /**
   * Single fetch + tally pass. Doesn't touch `loading`/`refreshing` —
   * the auto-poll and the Refresh button decide that for themselves so
   * we don't accidentally blank the screen on every silent background
   * tick.
   */
  const fetchOnce = useCallback(async (): Promise<void> => {
    if (!proposalId) return;
    try {
      const [coordPubkey, snap] = await Promise.all([
        getCoordPubkey(),
        getIndexedVotes(),
      ]);
      setSnapshot(snap);
      setError(null);

      const { tally: t, votes: v } = tallyRemarks(snap.remarks, {
        proposalId,
        coordPubkey,
      });
      setTally(t);
      setVotes(v);

      if (realAddress) {
        try {
          const stealth = await peekStealth(proposalId, realAddress);
          setAlreadyVoted(
            stealth ? v.some((vote) => vote.s === stealth.address) : false,
          );
        } catch {
          setAlreadyVoted(false);
        }
      } else {
        setAlreadyVoted(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [proposalId, realAddress]);

  /**
   * Manual refresh handler for the Refresh button. Cancels any pending
   * auto-poll, fetches immediately, then re-arms the auto-poll based on
   * the new status. The `refreshing` flag gives the button a brief
   * visual indication that something happened.
   */
  const refresh = useCallback(async (): Promise<void> => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
    setRefreshing(true);
    try {
      await fetchOnce();
    } finally {
      setRefreshing(false);
    }
    void tickRef.current?.();
  }, [fetchOnce]);

  useEffect(() => {
    let cancelled = false;

    const tick = async (): Promise<void> => {
      if (cancelled) return;
      await fetchOnce();
      if (cancelled) return;
      setLoading(false);
      const status = snapshotRef.current?.status;
      const interval =
        status === 'ready' ? READY_POLL_INTERVAL_MS : INDEXING_POLL_INTERVAL_MS;
      pollTimer.current = setTimeout(() => {
        void tick();
      }, interval);
    };

    tickRef.current = tick;
    void tick();

    return () => {
      cancelled = true;
      tickRef.current = null;
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [fetchOnce]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const isPastDeadline = proposal
    ? Date.now() > new Date(proposal.deadline).getTime()
    : false;

  const progress = snapshot
    ? {
        scanned: Math.max(0, snapshot.scannedThrough - snapshot.startBlock + 1),
        total: Math.max(0, snapshot.headBlock - snapshot.startBlock + 1),
      }
    : { scanned: 0, total: 0 };

  const indexedRemarks: IndexedRemark[] = snapshot?.remarks ?? [];
  const indexerStatus: 'indexing' | 'ready' | null = snapshot?.status ?? null;

  return {
    votes,
    tally,
    loading,
    refreshing,
    error,
    progress,
    alreadyVoted,
    isPastDeadline,
    refresh,
    indexedRemarks,
    indexerStatus,
    snapshot,
  };
}
