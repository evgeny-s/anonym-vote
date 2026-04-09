import { useState, useCallback, useEffect } from 'react';
import {
  web3Enable,
  web3Accounts,
  web3FromAddress,
} from '@polkadot/extension-dapp';

const APP_NAME = 'Anon Vote';

/**
 * Wallet hook.
 *
 * `voters` is the allowlist fetched from the faucet API at app boot. While
 * the list is empty (still loading) every account is considered "not
 * allowed"; once it arrives the hook re-evaluates the connected account
 * against it.
 */
export function useWallet(voters: string[]) {
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('anon-vote:address');
    if (saved) silentReconnect(saved);
  }, []);

  // Re-evaluate `isAllowed` whenever the voter list arrives or the
  // selected account changes. Without this, an account that connects
  // before voters loads would stay flagged as not-allowed forever.
  useEffect(() => {
    if (!selected) {
      setIsAllowed(false);
      return;
    }
    setIsAllowed(voters.includes(selected.address));
  }, [voters, selected]);

  async function silentReconnect(savedAddress) {
    try {
      const extensions = await web3Enable(APP_NAME);
      if (!extensions.length) return;
      const all = await web3Accounts();
      if (!all.length) return;
      setAccounts(all);
      const match = all.find((a) => a.address === savedAddress);
      if (match) applyAccount(match);
    } catch {
      console.error('Failed to reconnect to wallet');
    }
  }

  function applyAccount(account) {
    setSelected(account);
    setStatus('connected');
    localStorage.setItem('anon-vote:address', account.address);
  }

  const connect = useCallback(async () => {
    setStatus('connecting');
    setError(null);
    try {
      const extensions = await web3Enable(APP_NAME);
      if (!extensions.length) {
        throw new Error(
          'No Polkadot extension found. Install Polkadot.js extension and refresh.',
        );
      }
      const all = await web3Accounts();
      if (!all.length) {
        throw new Error(
          'No accounts found in the extension. Create or import an account first.',
        );
      }
      setAccounts(all);
      const allowed = all.find((a) => voters.includes(a.address));
      applyAccount(allowed ?? all[0]);
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  }, [voters]);

  const disconnect = useCallback(() => {
    setSelected(null);
    setIsAllowed(false);
    setStatus('idle');
    localStorage.removeItem('anon-vote:address');
  }, []);

  const switchAccount = useCallback(
    (address) => {
      const account = accounts.find((a) => a.address === address);
      if (account) applyAccount(account);
    },
    [accounts],
  );

  /**
   * Sign a message with the selected wallet.
   * Returns hex signature string.
   */
  const sign = useCallback(
    async (message) => {
      if (!selected) throw new Error('No wallet connected');
      const injector = await web3FromAddress(selected.address);
      const signRaw = injector?.signer?.signRaw;
      if (!signRaw) throw new Error('Signer does not support signRaw');
      const { signature } = await signRaw({
        address: selected.address,
        data: message,
        type: 'bytes',
      });
      return signature;
    },
    [selected],
  );

  return {
    accounts,
    selected,
    status,
    error,
    isAllowed,
    connect,
    disconnect,
    switchAccount,
    sign,
    address: selected?.address ?? null,
    name: selected?.meta?.name ?? null,
  };
}
