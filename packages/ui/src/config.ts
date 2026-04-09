export const SUBTENSOR_WS =
  (import.meta.env.VITE_SUBTENSOR_WS as string | undefined) ??
  'wss://test.finney.opentensor.ai:443';

export const FAUCET_URL =
  (import.meta.env.VITE_FAUCET_URL as string | undefined) ??
  'http://localhost:3000';

export const ACTIVE_PROPOSAL = {
  id: 'proposal-1',
  title: 'Release to Mainnet (Week of Apr 13)',
  description: `Features to be releases: <br>
                   1. Lock cost based Liquidity Injection on New Subnet Registration. <br>
                   2. Auto Child hotkeys`,
  deadline: '2026-04-15T12:00:00Z',
  quorum: 7,
  startBlock: 6_871_590,
};
