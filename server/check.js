// check.js — the counterparty check.
//
// Before any payment or contract call, the agent asks: should I deal
// with this account? The answer is allow / warn / block, with reasons.
// Every reason names the signal and the data source behind it.
//
// Signals, in decision order (first decisive signal wins, the rest are
// still reported):
//   1. Account-id shape — malformed ids are blocked, not guessed at.
//   2. Shared blocklist (data/blocklist.json, evidence attached) — a hit
//      is a hard block. Demo data, labelled as such.
//   3. NEAR testnet RPC (near-api-js viewAccount / viewAccessKeyList /
//      viewContractCode): account exists? balance? is it a contract?
//      does it hold full-access keys? Unreachable RPC means local
//      evidence only, and the decision says so.
//   4. Prior interactions, from the merged K-record (seed + live): past
//      payments to, and past blocks of, this account.
//   5. Contract code change: the current code hash compared ONLY with a
//      hash previously recorded in the K-record. No prior hash means
//      "not checked", never an invented change.
//   6. Human allowlist (Act 1 policy): the human vouched for this
//      account. It can allow a check when the RPC is unreachable, but
//      it can NEVER override a blocklist hit.
//   NOT scored: account age and activity history. A plain RPC account
//   view does not provide them, so they are reported as "not scored"
//   instead of estimated.
//
// Decision rules:
//   block — malformed id, or blocklist hit.
//   warn  — account not found on testnet, RPC unavailable (and not
//           allowlisted), a prior block in the record, contract code
//           changed since the recorded hash, or a contract account that
//           still holds a full-access key.
//   allow — everything checked came back clean, or the human allowlisted
//           the account and no block signal fired.

import { findBlocklistEntry, loadBlocklist } from './blocklist.js';
import { readAllEntries } from './ledger.js';
import { fetchAccountInfo } from './nearRpc.js';
import { isAccountIdShape } from './policy.js';

function reason(signal, level, text, source) {
  return { signal, level, text, source };
}

export async function runCheck({ rpcUrl, policy, accountId }) {
  const reasons = [];
  const evidence = {
    accountId,
    blocklist: { checked: false, hit: false },
    rpc: { checked: false, available: false },
    priorInteractions: { payments: 0, blocks: 0, lastSeen: null },
    codeChange: { status: 'notChecked', recordedHash: null, currentHash: null },
    accountAge: { status: 'notScored', detail: 'Account age and activity history are not available from a plain RPC account view.' },
    allowlist: { listed: false },
  };

  if (!isAccountIdShape(accountId)) {
    reasons.push(reason('account-shape', 'block',
      `Account id "${accountId}" is not a valid NEAR account id shape.`, 'local validation'));
    return finish('block', reasons, evidence);
  }

  // Signal 2: shared blocklist.
  let blocklistEntry = null;
  try {
    loadBlocklist();
    evidence.blocklist.checked = true;
    blocklistEntry = findBlocklistEntry(accountId);
  } catch (error) {
    reasons.push(reason('blocklist', 'warn',
      `Blocklist could not be read (${String(error.message).slice(0, 120)}). Treated as no hit, with a warning.`,
      'data/blocklist.json'));
  }
  if (blocklistEntry) {
    evidence.blocklist.hit = true;
    evidence.blocklist.entry = blocklistEntry;
    reasons.push(reason('blocklist', 'block',
      `Blocklisted: ${blocklistEntry.reason} Evidence: ${blocklistEntry.evidence}`,
      'data/blocklist.json (demo data)'));
  }

  // Signal 4 (read early, used by several rules): prior interactions.
  const entries = await readAllEntries();
  const related = entries.filter((e) =>
    (e.source && e.source.receiverId === accountId) || (typeof e.text === 'string' && e.text.includes(accountId)));
  for (const entry of related) {
    if (entry.kind === 'payment') evidence.priorInteractions.payments += 1;
    if (entry.kind === 'block') evidence.priorInteractions.blocks += 1;
    if (!evidence.priorInteractions.lastSeen || entry.date > evidence.priorInteractions.lastSeen) {
      evidence.priorInteractions.lastSeen = entry.date;
    }
  }
  const recorded = [...related].reverse().find((e) => e.source && e.source.codeHash);
  if (recorded) evidence.codeChange.recordedHash = recorded.source.codeHash;

  // Signal 3: NEAR testnet RPC.
  const rpcInfo = await fetchAccountInfo(rpcUrl, accountId);
  evidence.rpc.checked = true;
  evidence.rpc.available = rpcInfo.available;
  if (!rpcInfo.available) {
    evidence.rpc.error = rpcInfo.error;
    reasons.push(reason('rpc', 'warn',
      `NEAR testnet RPC unreachable (${rpcInfo.error || 'no response'}). Decision uses local evidence only.`,
      `RPC ${rpcUrl}`));
  } else if (rpcInfo.exists === false) {
    evidence.rpc.exists = false;
    reasons.push(reason('rpc', 'warn',
      'Account not found on NEAR testnet. It may be new, mistyped, or never created.',
      `RPC ${rpcUrl} (viewAccount)`));
  } else {
    evidence.rpc.exists = true;
    evidence.rpc.balanceNear = rpcInfo.balanceNear;
    evidence.rpc.balanceYocto = rpcInfo.balanceYocto;
    evidence.rpc.isContract = rpcInfo.isContract;
    evidence.rpc.codeHash = rpcInfo.codeHash;
    evidence.rpc.accessKeys = rpcInfo.accessKeys;
    evidence.codeChange.currentHash = rpcInfo.codeHash;
    reasons.push(reason('rpc', 'info',
      `Testnet account exists. Balance ${rpcInfo.balanceNear} NEAR. ${rpcInfo.isContract ? 'Hosts contract code.' : 'No contract code.'} ${rpcInfo.accessKeys.length} access key(s) listed.`,
      `RPC ${rpcUrl} (viewAccount, viewAccessKeyList, viewContractCode)`));
    if (rpcInfo.isContract && rpcInfo.accessKeys.some((k) => k.permission && k.permission.type === 'FullAccess')) {
      reasons.push(reason('rpc', 'warn',
        'Contract account still holds a full-access key, so its code could be replaced by that key holder.',
        `RPC ${rpcUrl} (viewAccessKeyList)`));
    }
    // Signal 5: code change, only against a previously recorded hash.
    if (rpcInfo.isContract) {
      if (evidence.codeChange.recordedHash) {
        if (evidence.codeChange.recordedHash !== rpcInfo.codeHash) {
          evidence.codeChange.status = 'changed';
          reasons.push(reason('code-change', 'warn',
            `Contract code hash differs from the hash recorded in the K-record (${evidence.codeChange.recordedHash.slice(0, 12)}… → ${rpcInfo.codeHash.slice(0, 12)}…).`,
            'K-record (prior entry) vs RPC viewAccount'));
        } else {
          evidence.codeChange.status = 'unchanged';
          reasons.push(reason('code-change', 'info',
            'Contract code hash matches the hash recorded in the K-record.',
            'K-record (prior entry) vs RPC viewAccount'));
        }
      } else {
        evidence.codeChange.status = 'notChecked';
      }
    }
  }

  // Signal 4 verdicts.
  if (evidence.priorInteractions.blocks > 0) {
    reasons.push(reason('prior-interactions', 'warn',
      `The K-record holds ${evidence.priorInteractions.blocks} prior block(s) involving this account (last ${evidence.priorInteractions.lastSeen}).`,
      'K-record (seed + live)'));
  } else if (evidence.priorInteractions.payments > 0) {
    reasons.push(reason('prior-interactions', 'info',
      `The K-record holds ${evidence.priorInteractions.payments} prior payment(s) to this account (last ${evidence.priorInteractions.lastSeen}).`,
      'K-record (seed + live)'));
  }

  // Signal 6: human allowlist. Never overrides a block.
  const allowlisted = (policy.allowlist || []).includes(accountId);
  evidence.allowlist.listed = allowlisted;
  if (allowlisted) {
    reasons.push(reason('allowlist', 'info',
      'Allowlisted by the human in the Act 1 policy.', 'human-set policy'));
  }

  // Decide: block wins, then warn, then allow.
  if (reasons.some((r) => r.level === 'block')) return finish('block', reasons, evidence);
  const warnings = reasons.filter((r) => r.level === 'warn');
  if (warnings.length > 0) {
    // The one exception: RPC-unavailable is the ONLY warning and the
    // human allowlisted the account — the human vouched, so allow, with
    // the warning kept visible in the reasons.
    const onlyRpcWarning = warnings.length === 1 && warnings[0].signal === 'rpc'
      && !evidence.rpc.available;
    if (allowlisted && onlyRpcWarning) return finish('allow', reasons, evidence);
    return finish('warn', reasons, evidence);
  }
  return finish('allow', reasons, evidence);
}

function finish(decision, reasons, evidence) {
  return { accountId: evidence.accountId, decision, reasons, evidence };
}
