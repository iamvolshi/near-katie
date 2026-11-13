// nearRpc.js — NEAR testnet reads via near-api-js (v7, JsonRpcProvider).
//
// What this module reads, and nothing else:
//   - node status (reachability probe)
//   - account view: exists, balance, code hash, storage usage
//   - access key list: public keys + permissions on the account
//   - contract code view: whether the account hosts a contract
//   - latest final block hash (for offline signing)
//
// Honesty rules, enforced here:
//   - Every call has its own timeout (default 6s) and zero retries, so a
//     dead endpoint fails fast instead of hanging the demo.
//   - A transport failure NEVER becomes invented data: callers get
//     { available: false } and must say "RPC unavailable — local evidence
//     only" in the UI.
//   - "Account does not exist" is told apart from transport failure by
//     the RPC error text (UnknownAccount / "does not exist"). That
//     heuristic is documented here because it is a heuristic.
//   - Account AGE and ACTIVITY HISTORY are not available from a plain
//     RPC account view, so this module never reports them. The check
//     labels them "not scored" instead of inventing history.
//   - Nothing in this module sends a transaction. Reads only.

import { baseDecode, formatNearAmount, JsonRpcProvider } from 'near-api-js';

const RPC_TIMEOUT_MS = 6000;

let provider = null;
let providerUrl = null;

export function getProvider(rpcUrl) {
  if (!provider || providerUrl !== rpcUrl) {
    provider = new JsonRpcProvider({ url: rpcUrl }, { retries: 0, wait: 100, backoff: 1 });
    providerUrl = rpcUrl;
  }
  return provider;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isAccountMissingError(error) {
  const message = String((error && error.message) || error || '');
  return /does not exist|UnknownAccount|account .* not found/i.test(message);
}

function describeError(error) {
  return String((error && error.message) || error || 'unknown error').slice(0, 200);
}

// Reachability probe: a node-status read. Returns { reachable, ms, error? }.
export async function probeRpc(rpcUrl) {
  const started = Date.now();
  try {
    await withTimeout(getProvider(rpcUrl).viewNodeStatus(), RPC_TIMEOUT_MS, 'RPC status');
    return { reachable: true, ms: Date.now() - started };
  } catch (error) {
    return { reachable: false, ms: Date.now() - started, error: describeError(error) };
  }
}

// Account view + key list + contract code, in one evidence object.
// Never throws for a missing account or a dead endpoint: both are data.
export async function fetchAccountInfo(rpcUrl, accountId) {
  const rpc = getProvider(rpcUrl);
  let view;
  try {
    view = await withTimeout(rpc.viewAccount({ accountId }), RPC_TIMEOUT_MS, 'viewAccount');
  } catch (error) {
    if (isAccountMissingError(error)) {
      return { available: true, exists: false, accountId };
    }
    return { available: false, exists: null, accountId, error: describeError(error) };
  }

  const info = {
    available: true,
    exists: true,
    accountId,
    balanceYocto: String(view.amount),
    balanceNear: formatNearAmount(view.amount),
    lockedYocto: String(view.locked),
    codeHash: String(view.codeHash),
    storageUsage: Number(view.storageUsage),
    accessKeys: [],
    accessKeysError: null,
    isContract: false,
    codeError: null,
  };

  try {
    const list = await withTimeout(
      rpc.viewAccessKeyList({ accountId }), RPC_TIMEOUT_MS, 'viewAccessKeyList',
    );
    info.accessKeys = (list.keys || []).map((k) => ({
      publicKey: String(k.publicKey),
      permission: summarizePermission(k.accessKey && k.accessKey.permission),
      nonce: String((k.accessKey && k.accessKey.nonce) || '0'),
    }));
  } catch (error) {
    info.accessKeysError = describeError(error);
  }

  try {
    await withTimeout(rpc.viewContractCode({ contractId: accountId }), RPC_TIMEOUT_MS, 'viewContractCode');
    info.isContract = true;
  } catch (error) {
    // No code at the account: a plain account, not a contract. The error
    // text is kept for the evidence panel, not treated as a failure.
    info.isContract = false;
    info.codeError = describeError(error);
  }
  return info;
}

function summarizePermission(permission) {
  if (permission === 'FullAccess') return { type: 'FullAccess' };
  if (permission && typeof permission === 'object') {
    const fc = permission.FunctionCall || permission.functionCall;
    if (fc) {
      return {
        type: 'FunctionCall',
        receiverId: fc.receiver_id || fc.receiverId,
        methodNames: fc.method_names || fc.methodNames || [],
        allowance: fc.allowance == null ? null : String(fc.allowance),
      };
    }
  }
  return { type: 'unknown', raw: String(permission).slice(0, 120) };
}

// Latest final block hash as raw bytes, for offline signing. Returns null
// when the RPC is unreachable — the guard then uses a labelled zero-hash
// placeholder and says so, because the transaction is never broadcast.
export async function fetchRecentBlockHash(rpcUrl) {
  try {
    const block = await withTimeout(
      getProvider(rpcUrl).viewBlock({ finality: 'final' }), RPC_TIMEOUT_MS, 'viewBlock',
    );
    const hash = block && block.header && block.header.hash;
    if (typeof hash !== 'string' || !hash) return null;
    const bytes = baseDecode(hash);
    if (bytes.length !== 32) return null;
    return { bytes, hashBase58: hash, height: block.header.height };
  } catch (_error) {
    return null;
  }
}
