import { useEffect, useState } from 'react';
import { getProposal } from '../faucet';
import type { Proposal } from '../faucet';

/**
 * Fetches the active proposal definition from the faucet API.
 *
 * Cached at the module level inside `getProposal`, so multiple components
 * calling this hook share a single network request.
 */
export function useProposal() {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getProposal()
      .then((p) => {
        if (!cancelled) {
          setProposal(p);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { proposal, loading, error };
}
