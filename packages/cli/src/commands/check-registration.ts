/**
 * `anon-vote check-registration` — verify that a wallet's announce
 * remark landed on chain and its voting key is in the canonical ring.
 *
 * Reads only public on-chain data (announce remarks). Does not touch
 * or reveal any secret key material.
 */

import {
  parseAnnounceRemark,
  reconstructRing,
  type RemarkLike,
} from '@anon-vote/shared';
import { connect, scanRemarks } from '../chain';
import { getFaucetInfo } from '../faucet';

export interface CheckRegistrationArgs {
  ws: string;
  expectedGenesis: string;
  faucetUrl: string;
  address: string;
  /** Overrides for values otherwise pulled from `/faucet/info`. */
  proposal?: string;
  allowed?: string[];
  toBlock?: number;
  concurrency: number;
  json: boolean;
}

interface CheckResult {
  address: string;
  proposalId: string;
  announceFound: boolean;
  announceBlock: number | null;
  vkPub: string | null;
  inRing: boolean;
  ringSize: number;
  onAllowlist: boolean;
}

export async function runCheckRegistration(
  args: CheckRegistrationArgs,
): Promise<number> {
  process.stderr.write(`Fetching faucet info from ${args.faucetUrl}…\n`);
  const info = await getFaucetInfo(args.faucetUrl);
  const proposalId = args.proposal ?? info.proposalId;
  const allowed = args.allowed ?? info.allowedVoters;
  const allowedSet = new Set(allowed);

  const onAllowlist = allowedSet.has(args.address);
  if (!onAllowlist) {
    process.stderr.write(
      `[warn] ${args.address} is NOT on the allowlist (${allowed.length} entries).\n`,
    );
  }

  process.stderr.write(`Connecting to ${args.ws}…\n`);
  const chain = await connect(args.ws, args.expectedGenesis);
  process.stderr.write(
    `Connected. head=${chain.head} genesis=${chain.genesisHash}\n`,
  );

  try {
    const toBlock = args.toBlock ?? chain.head;
    const startBlock = info.startBlock;

    const span = toBlock - startBlock + 1;
    process.stderr.write(
      `Scanning blocks [${startBlock}..${toBlock}] (${span.toLocaleString()} blocks)…\n`,
    );
    const remarks = await scanRemarks(chain.api, startBlock, toBlock, {
      concurrency: args.concurrency,
      onProgress: (done, total, matched) => {
        if (done % 100 === 0 || done === total) {
          const pct = ((done / total) * 100).toFixed(1);
          process.stderr.write(
            `\r  scanned ${done}/${total} (${pct}%) — ${matched} matching remarks`,
          );
        }
      },
    });
    process.stderr.write('\n');

    // Find the announce from this address for this proposal.
    let announceBlock: number | null = null;
    let vkPub: string | null = null;
    for (const r of remarks) {
      if (r.signer !== args.address) continue;
      const parsed = parseAnnounceRemark(r.text);
      if (!parsed || parsed.proposalId !== proposalId) continue;
      // Match reconstructRing's latest-wins logic.
      if (announceBlock === null || r.blockNumber > announceBlock) {
        announceBlock = r.blockNumber;
        vkPub = parsed.vkPub;
      }
    }

    const ring = reconstructRing(remarks, {
      proposalId,
      allowedRealAddresses: allowedSet,
    });
    const inRing = vkPub !== null && ring.includes(vkPub);

    const result: CheckResult = {
      address: args.address,
      proposalId,
      announceFound: vkPub !== null,
      announceBlock,
      vkPub,
      inRing,
      ringSize: ring.length,
      onAllowlist,
    };

    if (args.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      printHumanReadable(result);
    }

    return inRing ? 0 : 1;
  } finally {
    await chain.disconnect();
  }
}

function printHumanReadable(r: CheckResult): void {
  const L = (k: string, v: string | number | boolean): string =>
    `  ${k.padEnd(22)} ${v}`;

  const lines: string[] = [];
  lines.push('');
  lines.push('─── registration check ─────────────────────────────────────');
  lines.push(L('address', r.address));
  lines.push(L('proposal', r.proposalId));
  lines.push(L('on allowlist', r.onAllowlist));
  lines.push(
    L('announce found', r.announceFound ? `yes (block ${r.announceBlock})` : 'no'),
  );
  if (r.vkPub) {
    lines.push(L('voting key (vkPub)', r.vkPub));
  }
  lines.push(L('in canonical ring', r.inRing));
  lines.push(L('ring size', r.ringSize));
  lines.push('');

  if (r.inRing) {
    lines.push('  Result: REGISTERED — voting key is in the ring.');
  } else if (r.announceFound && !r.onAllowlist) {
    lines.push('  Result: NOT IN RING — address is not on the allowlist.');
  } else if (r.announceFound) {
    lines.push(
      '  Result: NOT IN RING — announce was found but the key did not make it into the canonical ring.',
    );
  } else if (!r.onAllowlist) {
    lines.push('  Result: NOT REGISTERED — no announce found and address is not on the allowlist.');
  } else {
    lines.push('  Result: NOT REGISTERED — no announce remark found on chain.');
  }
  lines.push('');

  process.stdout.write(lines.join('\n') + '\n');
}
