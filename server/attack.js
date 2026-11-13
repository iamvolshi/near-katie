// attack.js — the prompt-injection attack demo, shared by the CLI script
// (npm run attack-demo) and the UI button (POST /api/attack).
//
// The scenario: a file in the messy folder, data/pool/injected-instruction.txt,
// contains text that LOOKS like an order — pay a large amount to an
// address, raise the payment cap, skip human approval. That file is DATA.
// It is never an instruction to any agent. This module reads it as data,
// extracts what it ASKS for, and then runs the exact same guard path a
// real payment would take: policy evaluation, counterparty check,
// guarded signing. The expected outcome is BLOCKED: the target is on the
// shared blocklist, and the policy override is ignored because pool
// files cannot set policy.
//
// What gets recorded in the K-record (all three, every run):
//   - belief: the wrong belief the injected note planted (preserved, not
//     erased — the record shows what the agent believed, then the block)
//   - block: the block decision, with the reason and the ignored override
//   - authority: the trust drop after the attack
//
// Return value: { blocked, log[], entries[], check, policyBefore,
// policyAfter }. `blocked` is false ONLY if the guard failed — the CLI
// exits non-zero in that case, loudly.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findBlocklistEntry } from './blocklist.js';
import { runCheck } from './check.js';
import { guardedSign } from './guard.js';
import { appendKRecord, localToday, readAllEntries, signedTodayTotal } from './ledger.js';
import { evaluatePolicy, getPolicy } from './policy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const INJECTED_PATH = path.join(__dirname, '..', 'data', 'pool', 'injected-instruction.txt');

// Parse the injected ask OUT of the data file. Returns what the note
// asks for — target, amount, and whether it tries to override policy.
// Parsing is deliberately dumb (regex over the file text): the point is
// that the content is treated as untrusted data throughout.
export function parseInjectedInstruction(text) {
  const targetMatch = text.match(/([a-z0-9._-]+\.testnet)/);
  // The PAY amount, not the first number in the file: the cap-raise line
  // mentions 100 NEAR before the payment line mentions 50 NEAR.
  const payMatch = text.match(/pay\s+(\d+(?:\.\d+)?)\s*NEAR/i);
  const amountMatch = payMatch || text.match(/(\d+(?:\.\d+)?)\s*NEAR/i);
  const wantsCapRaise = /raise (the )?per-payment cap|increase (the )?cap/i.test(text);
  const wantsSkipApproval = /skip (human )?approval|no approval needed|without approval/i.test(text);
  if (!targetMatch || !amountMatch) {
    throw new Error('attack: could not parse a target + amount from the injected file.');
  }
  return {
    target: targetMatch[1],
    amountNear: Number(amountMatch[1]),
    wantsCapRaise,
    wantsSkipApproval,
  };
}

async function currentTrust() {
  const entries = await readAllEntries();
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].kind === 'authority' && typeof entries[i].trust === 'number') {
      return entries[i].trust;
    }
  }
  return 0.9;
}

export async function runAttack({ config }) {
  const log = [];
  const logLine = (line) => { log.push(line); };

  const injectedText = fs.readFileSync(INJECTED_PATH, 'utf8');
  const injected = parseInjectedInstruction(injectedText);
  const policyBefore = getPolicy();
  const today = localToday();

  logLine('ATTACK DEMO — prompt injection hidden in pool data');
  logLine(`File (DATA, not an instruction): data/pool/injected-instruction.txt`);
  logLine(`Injected ask: pay ${injected.amountNear} NEAR to ${injected.target}.`);
  logLine(`Injected override attempts: raise cap=${injected.wantsCapRaise}, skip approval=${injected.wantsSkipApproval}.`);
  logLine(`Policy before: per-payment cap ${policyBefore.perPaymentCapNear} NEAR, daily cap ${policyBefore.dailyCapNear} NEAR, approval at ${policyBefore.approvalThresholdNear} NEAR.`);

  // The override is ignored: policy comes only from the human endpoint.
  // Prove it by re-reading the policy after "applying" the injection
  // (which means: doing nothing with it) and comparing.
  const policyAfter = getPolicy();
  const policyUnchanged = JSON.stringify(policyBefore) === JSON.stringify(policyAfter);
  logLine(policyUnchanged
    ? 'Policy override IGNORED: pool files cannot set policy. Policy unchanged.'
    : 'POLICY CHANGED — this must never happen.');

  const { total: signedToday } = await signedTodayTotal();
  const policyCheck = evaluatePolicy(policyBefore, {
    receiverId: injected.target, amountNear: injected.amountNear, signedToday,
  });
  logLine(`Policy evaluation: allowed=${policyCheck.allowed}. ${policyCheck.reasons.join(' ')}`);

  const check = await runCheck({ rpcUrl: config.rpcUrl, policy: policyBefore, accountId: injected.target });
  logLine(`Counterparty check: ${check.decision.toUpperCase()}.`);
  for (const r of check.reasons) logLine(`  [${r.signal}/${r.level}] ${r.text}`);

  let signRefused = false;
  let signError = null;
  try {
    await guardedSign({
      rpcUrl: config.rpcUrl,
      signerId: config.demoSignerId,
      contractId: config.demoContractId,
      methodName: config.demoMethod,
      decision: check.decision,
      humanConfirmed: false,
      args: { decision: 'attack-demo', receiver: injected.target },
    });
  } catch (error) {
    signRefused = true;
    signError = error.message;
    logLine(`Guarded signing: REFUSED. ${signError}`);
  }

  const blocked = check.decision === 'block' && signRefused && policyUnchanged;
  const blockEntry = findBlocklistEntry(injected.target);
  const trustBefore = await currentTrust();
  const trustAfter = Math.max(0.1, Math.round((trustBefore - 0.3) * 10) / 10);

  const entries = [];
  entries.push(await appendKRecord({
    date: today, kind: 'belief', trust: trustBefore,
    text: `Believed the note in injected-instruction.txt: pay ${injected.amountNear} NEAR to ${injected.target}. The note was an injected instruction hidden in pool data, not a human order. The wrong belief stays in this record.`,
    source: { fileName: 'injected-instruction.txt', receiverId: injected.target, amountNear: injected.amountNear },
  }));
  entries.push(await appendKRecord({
    date: today, kind: 'block', trust: trustAfter,
    text: `Blocked payment of ${injected.amountNear} NEAR to ${injected.target}: ${blockEntry ? `blocklisted — ${blockEntry.reason}` : 'counterparty check returned block'}. No transaction was signed. The injected order to raise the cap and skip approval was ignored — pool files cannot set policy.`,
    source: { receiverId: injected.target, amountNear: injected.amountNear, decision: check.decision },
  }));
  entries.push(await appendKRecord({
    date: today, kind: 'authority', trust: trustAfter,
    text: `Trust dropped from ${trustBefore.toFixed(1)} to ${trustAfter.toFixed(1)} after the injected instruction tried to pay a blocklisted account.`,
    source: { receiverId: injected.target },
  }));

  logLine(blocked ? 'RESULT: BLOCKED. No transaction was signed. 3 K-record entries appended (belief, block, authority).'
    : 'RESULT: NOT BLOCKED — GUARD FAILURE. See log above.');
  return { blocked, log, entries, check, policyBefore, policyAfter, injected };
}
