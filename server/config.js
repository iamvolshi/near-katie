// config.js — environment configuration for KATIE Guard.
//
// Testnet only. The server REFUSES any other network: if NEAR_NETWORK is
// set to anything but "testnet", startup fails with a plain error. There
// is no mainnet path in this codebase, and no broadcast path at all —
// signing is offline-only by design (see guard.js).
//
//   NEAR_NETWORK      must be "testnet" (default: testnet)
//   NEAR_RPC_URL      testnet JSON-RPC endpoint (default: FASTNEAR testnet)
//   NEAR_BROADCAST    reserved, unused: broadcast is not implemented,
//                     so any value leaves the server offline-sign only.
//   NEAR_DEMO_SIGNER  account id named as the signer in offline-signed
//                     demo transactions (default: guard-demo-signer.testnet)
//   NEAR_DEMO_CONTRACT  contract id named as the receiver in offline-signed
//                     demo transactions (default: guard-demo.testnet).
//                     No contract is deployed at this id; nothing is
//                     broadcast, so the id is a labelled demo target only.
//   PORT              default 3000

export const DEFAULT_RPC_URL = 'https://test.rpc.fastnear.com';
export const DEFAULT_DEMO_SIGNER = 'guard-demo-signer.testnet';
export const DEFAULT_DEMO_CONTRACT = 'guard-demo.testnet';
export const DEMO_METHOD = 'record_decision';

export function loadConfig(env = process.env) {
  const network = (env.NEAR_NETWORK || 'testnet').trim().toLowerCase();
  if (network !== 'testnet') {
    throw new Error(
      `Refusing to start: NEAR_NETWORK must be "testnet", got "${network}". ` +
        'KATIE Guard is testnet-only and never touches mainnet.',
    );
  }
  const rpcUrl = (env.NEAR_RPC_URL || DEFAULT_RPC_URL).trim();
  if (/mainnet/i.test(rpcUrl)) {
    throw new Error(
      `Refusing to start: NEAR_RPC_URL looks like a mainnet endpoint ("${rpcUrl}"). ` +
        'KATIE Guard is testnet-only.',
    );
  }
  return {
    network,
    rpcUrl,
    // Broadcast is not implemented. The flag is accepted and ignored so a
    // stray "true" can never turn this demo into a spending tool.
    broadcastRequested: String(env.NEAR_BROADCAST || 'false').toLowerCase() === 'true',
    broadcastImplemented: false,
    demoSignerId: (env.NEAR_DEMO_SIGNER || DEFAULT_DEMO_SIGNER).trim(),
    demoContractId: (env.NEAR_DEMO_CONTRACT || DEFAULT_DEMO_CONTRACT).trim(),
    demoMethod: DEMO_METHOD,
    port: Number(env.PORT || 3000),
  };
}
