# @anon-vote/cli

Auditor CLI. Reconstructs an anon-vote proposal tally independently
from on-chain remarks and the WASM ring-signature verifier.

Uses the same `tallyRemarks` function as the UI and the same ring-sig
verifier as the backend faucet — no reimplementation, no alternative
"audit-time" logic.

## Build

```sh
# at repo root — builds WASM + shared package first
npm run wasm:build
npm run shared:build

# build the CLI
npm run build --workspace=@anon-vote/cli
```

## Usage

```sh
node packages/cli/dist/index.js verify \
  --ws wss://archive-rocksdb.internal.tao.com \
  --expected-genesis 0x077899043eb684c5277b6814a39161f4ce072b45e782e12c81a521c63fb4f3e5 \
  --proposal proposal-1 \
  --start-block 329195 \
  --allowed 5FTU22ZFWmzYWqCk5hJTyjq4W7VP3MTzJ1RB4NPec1h8sYCP,5FU9u1fGX5x2XgR5FZpkawZ4dXy7oLbQj8SxHdtydzWtyMXm,5H3DTzx9gQnqio9ixjxLtr7MyjzLrx5ZgRWDEsxgBELN4TJP \
  --coordinator 5Ff9wuYWk2r8qKutC5NKGBqEVY2rty5JXCBTXz5Tm7ndiWwQ
```

Add `--to-block <n>` to freeze the window at a specific block (useful
for reproducing historical snapshots). Add `--json` for machine output.

## Exit codes

- `0` — clean tally, no invalid votes
- `1` — invalid votes present, or no coordinator start-remark seen
- `2` — fatal error (genesis mismatch, RPC failure, bad args)

## Result hash

The human-readable output ends with a `sha256:` hash over the
canonicalized outcome (genesis, window, ring, tally, accepted votes).
Two independent runs against the same chain state produce the same
hash — one-line comparison for auditors.
