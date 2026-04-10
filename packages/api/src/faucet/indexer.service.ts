import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { u8aToString } from '@polkadot/util';
import { FaucetConfig } from '../config/faucet.config';
import { SubtensorService } from './subtensor.service';

/**
 * One indexed `system.remark` extrinsic.
 *
 * The `blockHash` field exists so the UI can deep-link straight into a
 * polkadot.js Apps explorer view at the exact block — i.e. so anyone can
 * independently verify that the remark really is on chain.
 */
export interface IndexedRemark {
  blockNumber: number;
  blockHash: string;
  signer: string;
  text: string;
}

export interface IndexerSnapshot {
  /**
   * `indexing` while the catch-up scan is more than `READY_LAG_BLOCKS`
   * behind the chain head; flips to `ready` once we are within that
   * distance and stays there as the live tail keeps up.
   */
  status: 'indexing' | 'ready';
  startBlock: number;
  scannedThrough: number;
  headBlock: number;
  remarks: IndexedRemark[];
}

const READY_LAG_BLOCKS = 3;
const CATCHUP_CONCURRENCY = 8;
const LIVE_POLL_INTERVAL_MS = 2_000;
const HEAD_REFRESH_INTERVAL_MS = 2_000;
const PROGRESS_LOG_EVERY = 3;

/**
 * Background block indexer.
 *
 * On boot, scans every block in `[proposal.startBlock .. headBlock]` looking
 * for `system.remark` extrinsics, keeping the matches in memory. After the
 * initial catch-up it polls for new blocks on a slow loop and appends any
 * new remarks. State is process-local — restarting the API rebuilds it
 * from chain.
 *
 * Why in-memory and not a DB? The dataset is tiny (one remark per voter
 * for a single proposal), and rebuilding from chain is the source of
 * truth anyway, so persistence would only add operational drag.
 */
@Injectable()
export class IndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IndexerService.name);

  private readonly remarks: IndexedRemark[] = [];
  private readonly seen = new Set<string>();

  private scannedThrough: number;
  private headBlock = 0;
  private destroyed = false;
  private liveTimer: NodeJS.Timeout | null = null;
  private blocksSinceLastLog = 0;

  constructor(
    private readonly config: FaucetConfig,
    private readonly subtensor: SubtensorService,
  ) {
    this.scannedThrough = this.config.proposal.startBlock - 1;
  }

  onModuleInit(): void {
    void this.run();
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    if (this.liveTimer) {
      clearTimeout(this.liveTimer);
      this.liveTimer = null;
    }
  }

  /** Snapshot of current indexer state — what `GET /faucet/votes` returns. */
  getSnapshot(): IndexerSnapshot {
    const status: IndexerSnapshot['status'] =
      this.headBlock > 0 &&
      this.headBlock - this.scannedThrough <= READY_LAG_BLOCKS
        ? 'ready'
        : 'indexing';

    return {
      status,
      startBlock: this.config.proposal.startBlock,
      scannedThrough: Math.max(
        this.scannedThrough,
        this.config.proposal.startBlock - 1,
      ),
      headBlock: this.headBlock,
      remarks: this.remarks.slice(),
    };
  }

  private async run(): Promise<void> {
    try {
      await this.catchUp();
    } catch (err) {
      this.logger.error(
        `Catch-up scan failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    this.scheduleLiveTick();
  }

  /**
   * Catch-up phase: scan from the current `scannedThrough + 1` to the
   * current head, in concurrent batches. Updates head once at the start
   * and again at the end so a long initial scan still flips to `ready`
   * when it converges.
   */
  private async catchUp(): Promise<void> {
    await this.refreshHead();
    if (this.headBlock <= this.scannedThrough) return;

    const startedAt = Date.now();
    const from = this.scannedThrough + 1;
    const to = this.headBlock;
    this.logger.log(
      `Starting catch-up scan: blocks ${from}..${to} (${to - from + 1} blocks)`,
    );

    await this.scanRange(from, to);

    this.logger.log(
      `Catch-up complete: ${this.remarks.length} remarks in ${(
        (Date.now() - startedAt) /
        1000
      ).toFixed(1)}s`,
    );

    await this.refreshHead();
    if (this.headBlock > this.scannedThrough) {
      await this.scanRange(this.scannedThrough + 1, this.headBlock);
    }
  }

  /**
   * Live tail: every few seconds, fetch the head and ingest any new
   * blocks. Errors are logged but don't kill the loop — we'll catch the
   * skipped block on the next tick.
   */
  private scheduleLiveTick(): void {
    if (this.destroyed) return;
    this.liveTimer = setTimeout(() => {
      void this.liveTick().finally(() => this.scheduleLiveTick());
    }, LIVE_POLL_INTERVAL_MS);
  }

  private async liveTick(): Promise<void> {
    try {
      await this.refreshHead();
      if (this.headBlock > this.scannedThrough) {
        await this.scanRange(this.scannedThrough + 1, this.headBlock);
      }
    } catch (err) {
      this.logger.warn(
        `Live tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private headRefreshedAt = 0;
  private async refreshHead(): Promise<void> {
    const now = Date.now();
    if (now - this.headRefreshedAt < HEAD_REFRESH_INTERVAL_MS && this.headBlock)
      return;
    const api = await this.subtensor.getApiConnection();
    const header = await api.rpc.chain.getHeader();
    this.headBlock = header.number.toNumber();
    this.headRefreshedAt = now;
  }

  /**
   * Scan `[from..to]` inclusive with a small worker pool.
   *
   * Workers pick blocks in increasing order via `next++`, so blocks finish
   * out of order. We track completion in a `done` set and walk
   * `scannedThrough` forward across its contiguous prefix as soon as each
   * block lands — that way the `/faucet/votes` snapshot reflects live
   * progress instead of jumping from 0% to 100% only when the whole batch
   * finishes (which would take minutes for a large catch-up).
   *
   * Failed blocks are NOT marked done, so `scannedThrough` will stop just
   * before the first failure and the next live tick will retry it.
   */
  private async scanRange(from: number, to: number): Promise<void> {
    if (from > to) return;
    const api = await this.subtensor.getApiConnection();

    let next = from;
    const done = new Set<number>();

    const worker = async (): Promise<void> => {
      while (!this.destroyed) {
        const n = next++;
        if (n > to) return;
        try {
          const hash = await api.rpc.chain.getBlockHash(n);
          const hashHex = hash.toHex();
          const signedBlock = await api.rpc.chain.getBlock(hash);
          const exs = signedBlock.block.extrinsics;
          for (let i = 0; i < exs.length; i++) {
            const ex = exs[i];
            const { section, method } = ex.method;
            if (section !== 'system' || method !== 'remark') continue;
            if (!ex.isSigned) continue;
            const arg = ex.method.args[0];
            let text: string;
            try {
              text = u8aToString(
                (arg as { toU8a(b: boolean): Uint8Array }).toU8a(true),
              );
            } catch {
              continue;
            }
            const dedupeKey = `${n}:${i}`;
            if (this.seen.has(dedupeKey)) continue;
            this.seen.add(dedupeKey);
            this.remarks.push({
              blockNumber: n,
              blockHash: hashHex,
              signer: ex.signer.toString(),
              text,
            });
          }
          done.add(n);
          this.advanceScannedThrough(done);
          this.bumpProgressLog();
        } catch (err) {
          this.logger.debug(
            `Block ${n} fetch failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(CATCHUP_CONCURRENCY, to - from + 1) },
      () => worker(),
    );
    await Promise.all(workers);

    this.advanceScannedThrough(done);

    this.remarks.sort((a, b) => a.blockNumber - b.blockNumber);
  }

  /**
   * Walk `scannedThrough` forward across the contiguous prefix of `done`,
   * removing entries from the set as we consume them.
   */
  private advanceScannedThrough(done: Set<number>): void {
    while (done.has(this.scannedThrough + 1)) {
      this.scannedThrough++;
      done.delete(this.scannedThrough);
    }
  }

  /**
   * Periodic progress heartbeat. Logs every `PROGRESS_LOG_EVERY` blocks
   * so an operator can see at a glance that the indexer is making
   * forward progress (and roughly how fast).
   */
  private bumpProgressLog(): void {
    this.blocksSinceLastLog++;
    if (this.blocksSinceLastLog < PROGRESS_LOG_EVERY) return;
    this.blocksSinceLastLog = 0;
    const lag = Math.max(0, this.headBlock - this.scannedThrough);
    this.logger.log(
      `indexer: scanned=${this.scannedThrough} head=${this.headBlock} lag=${lag} remarks=${this.remarks.length}`,
    );
  }
}
