/**
 * Ring-signature verifier — thin wrapper over the node-target wasm-pack
 * build in packages/ring-sig/wasm/pkg. Identical shape to the backend's
 * verifier so the CLI verifies signatures with the exact same crypto
 * path the faucet uses.
 *
 * Requires `npm run wasm:build` at repo root before the CLI can run —
 * the pkg/ directory is gitignored and only produced by wasm-pack.
 */

import type { RingSigVerify } from '@anon-vote/shared';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const wasm = require('../../ring-sig/wasm/pkg/ring_sig_wasm.js') as {
  verify_js: (sig: unknown, ring: string[], messageHex: string) => boolean;
};

export const verifyRingSig: RingSigVerify = (sig, ring, messageHex) => {
  try {
    return wasm.verify_js(sig, [...ring], messageHex);
  } catch {
    return false;
  }
};
