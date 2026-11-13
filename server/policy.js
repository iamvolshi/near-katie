// policy.js — the human-set payment policy.
//
// One concept: what the human allows the agent to do with money. The
// policy can ONLY be set by a human through POST /api/policy (the Act 1
// form). Pool files, chat logs, pasted text, and agent output can never
// change it — the attack demo proves that: an injected instruction to
// raise the cap is read as data and ignored.
//
// Policy shape:
//   { perPaymentCapNear, dailyCapNear, approvalThresholdNear, allowlist }
//   - perPaymentCapNear: no single payment above this, ever.
//   - dailyCapNear: total offline-signed per local day may not exceed this.
//   - approvalThresholdNear: payments at or above this need explicit
//     human confirmation (the UI confirm step / confirm flag).
//   - allowlist: account ids the human has explicitly approved. An
//     allowlisted counterparty may be allowed even when the RPC is
//     unreachable, because the human — not the network — vouched for it.
//
// Stored in memory only: restarting the server resets the policy to the
// defaults below. That is deliberate for a demo — no stale policy can
// survive a restart unnoticed.

export const DEFAULT_POLICY = Object.freeze({
  perPaymentCapNear: 1,
  dailyCapNear: 5,
  approvalThresholdNear: 0.5,
  allowlist: Object.freeze(['supplier-demo.testnet']),
});

let currentPolicy = {
  perPaymentCapNear: DEFAULT_POLICY.perPaymentCapNear,
  dailyCapNear: DEFAULT_POLICY.dailyCapNear,
  approvalThresholdNear: DEFAULT_POLICY.approvalThresholdNear,
  allowlist: [...DEFAULT_POLICY.allowlist],
};

export function getPolicy() {
  return {
    ...currentPolicy,
    allowlist: [...currentPolicy.allowlist],
    defaults: { ...DEFAULT_POLICY, allowlist: [...DEFAULT_POLICY.allowlist] },
    storedIn: 'memory only — resets to defaults on server restart',
  };
}

// NEAR account id shape (testnet): lowercase letters, digits, -, _, .
// This validates the SHAPE only; existence is the RPC signal's job.
export function isAccountIdShape(accountId) {
  return typeof accountId === 'string'
    && accountId.length >= 2
    && accountId.length <= 64
    && /^[a-z0-9._-]+$/.test(accountId)
    && !accountId.startsWith('.')
    && !accountId.endsWith('.')
    && !accountId.includes('..');
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

// Validate + install a human-supplied policy. Throws Error on bad input;
// the route turns that into a 400. Never called with pool/agent data.
export function setPolicy(input) {
  if (!input || typeof input !== 'object') throw new Error('Policy must be an object.');
  const { perPaymentCapNear, dailyCapNear, approvalThresholdNear, allowlist } = input;
  if (!isPositiveNumber(perPaymentCapNear)) {
    throw new Error('perPaymentCapNear must be a number greater than 0.');
  }
  if (!isPositiveNumber(dailyCapNear)) {
    throw new Error('dailyCapNear must be a number greater than 0.');
  }
  if (!isPositiveNumber(approvalThresholdNear)) {
    throw new Error('approvalThresholdNear must be a number greater than 0.');
  }
  if (dailyCapNear < perPaymentCapNear) {
    throw new Error('dailyCapNear must be at least perPaymentCapNear.');
  }
  const allow = Array.isArray(allowlist) ? allowlist : [];
  for (const id of allow) {
    if (!isAccountIdShape(id)) throw new Error(`Allowlist entry "${id}" is not a valid NEAR account id shape.`);
  }
  currentPolicy = {
    perPaymentCapNear,
    dailyCapNear,
    approvalThresholdNear,
    allowlist: [...new Set(allow)],
  };
  return getPolicy();
}

// Evaluate a proposed payment against the policy. Pure: no I/O, no writes.
// Returns { allowed, needsApproval, reasons[] }. A policy breach is final:
// no confirmation flag can override a cap — only a human changing the
// policy (a new K-record permission entry) can.
export function evaluatePolicy(policy, { receiverId, amountNear, signedToday }) {
  const reasons = [];
  let allowed = true;
  let needsApproval = false;

  if (!isAccountIdShape(receiverId)) {
    return { allowed: false, needsApproval: false, reasons: [`Receiver "${receiverId}" is not a valid NEAR account id shape.`] };
  }
  if (typeof amountNear !== 'number' || !Number.isFinite(amountNear) || amountNear <= 0) {
    return { allowed: false, needsApproval: false, reasons: ['Amount must be a number greater than 0 NEAR.'] };
  }
  if (amountNear > policy.perPaymentCapNear) {
    allowed = false;
    reasons.push(`Amount ${amountNear} NEAR is over the per-payment cap of ${policy.perPaymentCapNear} NEAR.`);
  }
  if (signedToday + amountNear > policy.dailyCapNear) {
    allowed = false;
    reasons.push(`Daily cap: ${signedToday} NEAR already signed today + ${amountNear} NEAR would exceed the daily cap of ${policy.dailyCapNear} NEAR.`);
  }
  if (allowed && amountNear >= policy.approvalThresholdNear) {
    needsApproval = true;
    reasons.push(`Amount ${amountNear} NEAR is at or over the human-approval threshold of ${policy.approvalThresholdNear} NEAR.`);
  }
  if (allowed && !needsApproval) {
    reasons.push(`Within policy: ${amountNear} NEAR, per-payment cap ${policy.perPaymentCapNear} NEAR, daily cap ${policy.dailyCapNear} NEAR.`);
  }
  return { allowed, needsApproval, reasons };
}
