#!/usr/bin/env node
/**
 * anon-vote CLI — auditor tooling.
 */

import { Command } from 'commander';
import { runVerify } from './commands/verify';

const program = new Command();

program
  .name('anon-vote')
  .description('Auditor CLI for anon-vote proposals')
  .version('0.1.0');

program
  .command('verify')
  .description(
    'Scan chain, reconstruct the ring, verify every ring signature, ' +
      'and print the tally. Everything needed to reproduce the result ' +
      'is passed via flags — no repo checkout required.',
  )
  .requiredOption('--ws <url>', 'Subtensor WS endpoint')
  .requiredOption(
    '--expected-genesis <hex>',
    'Pinned genesis hash; endpoint is rejected if it reports a different one',
  )
  .requiredOption('--proposal <id>', 'Proposal id (e.g. proposal-1)')
  .requiredOption(
    '--start-block <n>',
    'Block at which the proposal window begins',
    (v) => Number.parseInt(v, 10),
  )
  .requiredOption(
    '--allowed <csv>',
    'Comma-separated SS58 addresses of allowed voters',
    (v) => v.split(',').map((s) => s.trim()).filter(Boolean),
  )
  .requiredOption(
    '--coordinator <addr>',
    'SS58 address of the coordinator (start-remark signer)',
  )
  .option(
    '--to-block <n>',
    'Last block to include; defaults to chain head at scan time',
    (v) => Number.parseInt(v, 10),
  )
  .option(
    '--concurrency <n>',
    'Parallel block fetches (default 16)',
    (v) => Number.parseInt(v, 10),
    16,
  )
  .option('--json', 'Machine-readable output', false)
  .action(async (opts) => {
    try {
      const code = await runVerify({
        ws: opts.ws,
        expectedGenesis: opts.expectedGenesis,
        proposal: opts.proposal,
        startBlock: opts.startBlock,
        toBlock: opts.toBlock,
        allowed: opts.allowed,
        coordinator: opts.coordinator,
        concurrency: opts.concurrency,
        json: Boolean(opts.json),
      });
      process.exit(code);
    } catch (e) {
      process.stderr.write(
        `\nerror: ${e instanceof Error ? e.message : String(e)}\n`,
      );
      process.exit(2);
    }
  });

program.parseAsync(process.argv).catch((e) => {
  process.stderr.write(
    `\nerror: ${e instanceof Error ? e.message : String(e)}\n`,
  );
  process.exit(2);
});
