/**
 * Three-phase voting clock.
 *
 * Reads the indexer's remark list plus the current chain head and
 * returns the current phase:
 *
 *   'announce' — coordinator's `start` remark has not been seen.
 *   'voting'   — start remark observed and either no endBlock is
 *                configured, or head is still below it.
 *   'ended'    — an endBlock is configured and chain head has
 *                reached it. Further registrations/votes are
 *                refused; the UI offers a link to the Results tab.
 *
 * Why two phases instead of inferring from time / block deltas:
 * the coordinator publishes their start remark when they decide
 * voting should open. There is no clock-driven boundary for the
 * START — the coordinator's sr25519-signed extrinsic is it. The
 * END, on the other hand, is chain-clock-driven and set at build
 * time via `endBlock`.
 */

import { useMemo } from 'react';
import { findVotingStartBlock, type RemarkLike } from '@anon-vote/shared';
import type { ProposalConfig } from '../proposal';

export type Phase = 'announce' | 'voting' | 'ended';

export interface VotingPhase {
  phase: Phase;
  /**
   * Block number at which the coordinator's start remark landed,
   * or null if it hasn't yet. Voters use this to know when their
   * vote will land in a "post-start" block (i.e., be counted).
   */
  startBlock: number | null;
  /** Configured end block (null when the proposal is open-ended). */
  endBlock: number | null;
}

export function useVotingPhase(
  remarks: readonly RemarkLike[],
  config: ProposalConfig,
  headBlock: number | null,
): VotingPhase {
  return useMemo(() => {
    const startBlock = findVotingStartBlock([...remarks], {
      proposalId: config.id,
      coordinatorAddress: config.coordinatorAddress,
    });
    const ended =
      config.endBlock !== null &&
      headBlock !== null &&
      headBlock >= config.endBlock;
    const phase: Phase = ended
      ? 'ended'
      : startBlock === null
        ? 'announce'
        : 'voting';
    return { phase, startBlock, endBlock: config.endBlock };
  }, [
    remarks,
    config.id,
    config.coordinatorAddress,
    config.endBlock,
    headBlock,
  ]);
}
