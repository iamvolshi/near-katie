// server/index.js — KATIE Guard demo server (NEAR Hackathon 2026,
// security track). Serves the single-page demo and the guard API.
//
//   GET  /api/health          service + RPC reachability + broadcast: never
//   GET  /api/policy          current human-set policy
//   POST /api/policy          human sets the policy (K-record permission entry)
//   POST /api/check           { accountId } -> allow/warn/block + reasons (read-only)
//   POST /api/pay             { receiverId, amountNear, memo?, confirm? }
//                             guarded: policy + check + offline sign, or refuse
//   POST /api/attack          run the prompt-injection attack demo server-side
//
// Static: public/ at /, data/ at /data (read-only mount: the pool, the
// seed record, the live ledger, the blocklist — no secrets live there).
//
// Rules enforced here: testnet only (config.js refuses anything else),
// no broadcast path exists anywhere, signing is offline-only, and every
// decision that moves or refuses money is appended to the K-record.

import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAttack } from './attack.js';
import { runCheck } from './check.js';
import { loadConfig } from './config.js';
import { guardedSign } from './guard.js';
import { appendKRecord, localToday, readAllEntries, signedTodayTotal } from './ledger.js';
import { probeRpc } from './nearRpc.js';
import { evaluatePolicy, getPolicy, setPolicy } from './policy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/.env wins; repo-root .env is the fallback (dotenv never overwrites).
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const config = loadConfig();
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/data', express.static(path.join(__dirname, '..', 'data')));

// RPC reachability is probed in the background (at startup, then every
// 60s) so /api/health never blocks on a dead endpoint. Until the first
// probe finishes, the status is honestly "unknown".
let rpcStatus = { reachable: null, checkedAt: null, error: 'probe not finished yet' };
async function refreshRpcStatus() {
  const probe = await probeRpc(config.rpcUrl);
  rpcStatus = { ...probe, checkedAt: new Date().toISOString() };
}
refreshRpcStatus();
setInterval(refreshRpcStatus, 60_000).unref();

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'katie-guard',
    network: config.network,
    rpcUrl: config.rpcUrl,
    rpcReachable: rpcStatus.reachable,
    rpcCheckedAt: rpcStatus.checkedAt,
    rpcError: rpcStatus.error || null,
    broadcastImplemented: config.broadcastImplemented,
    broadcast: false,
    signing: 'offline-only, ephemeral in-memory keypair, never broadcast',
    nearApiJs: pkg.dependencies['near-api-js'],
    node: process.version,
    time: new Date().toISOString(),
  });
});

app.get('/api/policy', (_req, res) => {
  res.json(getPolicy());
});

app.post('/api/policy', async (req, res) => {
  try {
    const policy = setPolicy(req.body || {});
    const entry = await appendKRecord({
      date: localToday(),
      kind: 'permission',
      trust: 1.0,
      text: `Human set payment policy: per-payment cap ${policy.perPaymentCapNear} NEAR, daily cap ${policy.dailyCapNear} NEAR, human approval at or over ${policy.approvalThresholdNear} NEAR, allowlist: ${policy.allowlist.length ? policy.allowlist.join(', ') : 'none'}.`,
      source: { policy: { ...policy, defaults: undefined, storedIn: undefined } },
    });
    return res.json({ ...policy, kRecordSeq: entry.seq });
  } catch (error) {
    return res.status(400).json({ error: error.message, code: 'VALIDATION_ERROR' });
  }
});

// Read-only: a check answers a question, it writes nothing to the record.
app.post('/api/check', async (req, res) => {
  const { accountId } = req.body || {};
  if (typeof accountId !== 'string' || !accountId.trim()) {
    return res.status(400).json({ error: 'accountId is required.', code: 'VALIDATION_ERROR' });
  }
  try {
    const check = await runCheck({ rpcUrl: config.rpcUrl, policy: getPolicy(), accountId: accountId.trim() });
    return res.json(check);
  } catch (error) {
    return res.status(500).json({ error: error.message, code: 'CHECK_FAILED' });
  }
});

app.post('/api/pay', async (req, res) => {
  const { receiverId, amountNear, memo, confirm } = req.body || {};
  const today = localToday();
  const policy = getPolicy();
  const amount = Number(amountNear);
  try {
    // Step 1: policy. A breach is final — confirmation cannot override it.
    const { total: signedToday } = await signedTodayTotal();
    const policyResult = evaluatePolicy(policy, { receiverId, amountNear: amount, signedToday });
    if (!policyResult.allowed) {
      const entry = await appendKRecord({
        date: today, kind: 'block', trust: 0.9,
        text: `Blocked payment of ${amount} NEAR to ${receiverId}: ${policyResult.reasons.join(' ')} No transaction was signed.`,
        source: { receiverId, amountNear: amount, decision: 'policy-block' },
      });
      return res.status(403).json({
        decision: 'block', blockedBy: 'policy', reasons: policyResult.reasons,
        policy, kRecordSeq: entry.seq, signed: false,
      });
    }

    // Step 2: counterparty check.
    const check = await runCheck({ rpcUrl: config.rpcUrl, policy, accountId: receiverId });
    if (check.decision === 'block') {
      const entry = await appendKRecord({
        date: today, kind: 'block', trust: 0.9,
        text: `Blocked payment of ${amount} NEAR to ${receiverId}: counterparty check returned block (${check.reasons.filter((r) => r.level === 'block').map((r) => r.text).join(' ')}). No transaction was signed.`,
        source: { receiverId, amountNear: amount, decision: 'block' },
      });
      return res.status(403).json({ ...check, blockedBy: 'counterparty', policy, kRecordSeq: entry.seq, signed: false });
    }
    const humanConfirmed = confirm === true;
    if ((check.decision === 'warn' || policyResult.needsApproval) && !humanConfirmed) {
      const entry = await appendKRecord({
        date: today, kind: 'belief', trust: 0.9,
        text: `Held payment of ${amount} NEAR to ${receiverId} pending human confirmation: ${[...check.reasons.filter((r) => r.level === 'warn').map((r) => r.text), ...policyResult.reasons.filter((r) => r.includes('approval'))].join(' ')} No transaction was signed yet.`,
        source: { receiverId, amountNear: amount, decision: 'held' },
      });
      return res.status(409).json({
        ...check, held: true, needsConfirmation: true, policy, policyReasons: policyResult.reasons,
        kRecordSeq: entry.seq, signed: false,
      });
    }

    // Step 3: guarded offline signing. Never broadcast, no tokens move.
    const signed = await guardedSign({
      rpcUrl: config.rpcUrl,
      signerId: config.demoSignerId,
      contractId: config.demoContractId,
      methodName: config.demoMethod,
      decision: check.decision,
      humanConfirmed,
      args: { decision: check.decision, receiver: receiverId, amountNear: amount, memo: memo || '' },
    });
    const entry = await appendKRecord({
      date: today, kind: 'payment', trust: 1.0,
      text: `Offline-signed a guarded payment of ${amount} NEAR to ${receiverId} (counterparty: ${check.decision}${humanConfirmed ? ', human-confirmed' : ''}). Not broadcast — no tokens moved. Signed transaction hash ${signed.txHashBase58.slice(0, 16)}….`,
      source: {
        receiverId, amountNear: amount, decision: check.decision, humanConfirmed,
        txHash: signed.txHashBase58, codeHash: check.evidence.rpc ? check.evidence.rpc.codeHash || null : null,
      },
    });
    return res.json({
      ...check, policy, policyReasons: policyResult.reasons,
      signed: true, offline: true, broadcast: false, humanConfirmed,
      signature: signed, kRecordSeq: entry.seq,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message, code: 'PAY_FAILED' });
  }
});

app.post('/api/attack', async (_req, res) => {
  try {
    const result = await runAttack({ config });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message, code: 'ATTACK_FAILED' });
  }
});

app.get('/api/ledger', async (_req, res) => {
  res.json({ entries: await readAllEntries() });
});

app.use((error, _req, res, _next) => {
  if (error && error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON.', code: 'VALIDATION_ERROR' });
  }
  return res.status(500).json({ error: 'Internal error.', code: 'INTERNAL_ERROR' });
});

app.listen(config.port, () => {
  console.log(`katie-guard listening on http://localhost:${config.port} (network=${config.network}, rpc=${config.rpcUrl}, broadcast=not-implemented)`);
});
