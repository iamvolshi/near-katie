// guard.js — the guarded signing wrapper.
//
// The agent NEVER signs directly. It asks this wrapper, and the wrapper
// decides, from the policy + counterparty check, whether signing is
// allowed at all:
//
//   block  -> refuse to sign. No override, no confirm flag, no exception.
//   warn   -> refuse unless the human explicitly confirmed (the UI
//             confirm step, or confirm:true on the API). The confirmation
//             is recorded in the K-record.
//   allow  -> sign, offline, and record the decision.
//
// Signing uses a FUNCTION-CALL access key scoped to ONE contract, never
// a full-access key. The permission object is shown on screen and in the
// log on every signing:
//   { receiver_id, method_names, allowance }
//
// What "function-call key" means, per the NEAR access-keys docs:
// a function-call key can only sign transactions calling a specific
// contract, and does not allow attaching NEAR tokens. This demo signs a
// contract call with a 0 deposit, matching that limit.
//
// The demo keypair is EPHEMERAL: generated in memory at signing time with
// KeyPair.fromRandom, never stored, never written to disk, never
// committed. The signed transaction is an offline artifact: it is built
// and signed locally, shown to the human, and NEVER broadcast. There is
// no broadcast code path in this prototype, so no value of any flag can
// turn a demo signing into a real transaction. No tokens move. Ever.
//
// Block hash: taken from the latest final testnet block when the RPC is
// reachable; otherwise a labelled all-zero placeholder hash, because the
// transaction is never broadcast and the placeholder is part of the
// honest labelling, not a claim about the chain.

import {
  actions, baseEncode, KeyPair, KeyPairSigner, createTransaction, parseNearAmount,
} from 'near-api-js';
import { fetchRecentBlockHash } from './nearRpc.js';

const GAS_30_TGAS = 30n * 10n ** 12n;
const ALLOWANCE_NEAR = '0.25';

export function demoPermission(contractId, methodName) {
  const allowance = parseNearAmount(ALLOWANCE_NEAR);
  const key = actions.functionCallAccessKey(contractId, [methodName], allowance);
  const fc = key.permission.functionCall;
  return {
    receiver_id: fc.receiverId,
    method_names: [...fc.methodNames],
    allowance: String(fc.allowance),
    allowanceNear: ALLOWANCE_NEAR,
    keyType: 'FunctionCall (never FullAccess)',
  };
}

// Sign offline. Inputs are the already-decided payment: this function
// does NOT re-decide policy or counterparty — the caller (index.js /
// attack.js) ran those and passes the decision in. It refuses to sign
// when decision is 'block', or 'warn' without human confirmation.
export async function guardedSign({
  rpcUrl, signerId, contractId, methodName, decision, humanConfirmed, args,
}) {
  if (decision === 'block') {
    throw new Error('Guard refused: counterparty decision is block. Refusing to sign.');
  }
  if (decision === 'warn' && !humanConfirmed) {
    throw new Error('Guard held: counterparty decision is warn and no human confirmation was given. Refusing to sign.');
  }
  if (decision !== 'allow' && decision !== 'warn') {
    throw new Error(`Guard refused: unknown decision "${decision}".`);
  }

  const keyPair = KeyPair.fromRandom('ed25519');
  const publicKey = keyPair.getPublicKey();
  const signer = new KeyPairSigner(keyPair);

  const recent = await fetchRecentBlockHash(rpcUrl);
  const blockHash = recent ? recent.bytes : new Uint8Array(32);
  const blockHashSource = recent
    ? { source: 'rpc', hashBase58: recent.hashBase58, height: recent.height }
    : { source: 'placeholder-zero', detail: 'RPC unreachable; all-zero hash. Transaction is never broadcast.' };

  const transaction = createTransaction(
    signerId,
    publicKey,
    contractId,
    1n,
    [actions.functionCall(methodName, args || {}, GAS_30_TGAS, 0n)],
    blockHash,
  );
  const { txHash, signedTransaction } = await signer.signTransaction(transaction);
  const encoded = signedTransaction.encode();

  return {
    broadcast: false,
    broadcastNote: 'Offline-signed only. Never broadcast. No tokens moved.',
    signerId,
    receiverId: contractId,
    methodName,
    permission: demoPermission(contractId, methodName),
    ephemeralPublicKey: publicKey.toString(),
    keyNote: 'Ephemeral in-memory keypair, generated at signing time, never stored.',
    txHashBase58: baseEncode(txHash),
    signatureBase58: baseEncode(signedTransaction.signature.data),
    signedTransactionBase64: Buffer.from(encoded).toString('base64'),
    signedTransactionBytes: encoded.length,
    blockHash: blockHashSource,
    nonce: '1',
    gas: GAS_30_TGAS.toString(),
    depositYocto: '0',
    args: args || {},
  };
}
