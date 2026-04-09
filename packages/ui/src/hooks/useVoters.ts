import { useEffect, useState } from 'react';
import { getVoters } from '../faucet';

/**
 * Fetches the allowed voter list from the faucet API.
 *
 * Cached at the module level inside `getVoters`, so multiple components
 * calling this hook share a single network request.
 */
export function useVoters() {
  const [voters, setVoters] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getVoters()
      .then((list) => {
        if (!cancelled) {
          setVoters(list);
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

  return { voters, loading, error };
}
