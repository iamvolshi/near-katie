// views.js — DOM rendering helpers for the KATIE Guard demo.
// No state, no fetching: app.js owns the flow, this file only turns data
// into HTML and wires the buttons. Browser-only at runtime; the function
// definitions load cleanly in Node for a syntax check.
//
// Catalog/report/audit renderers are the baseline shapes from the PayPal
// Curator demo (Nov 9-12, 2026), reworded; the check/pay/attack/policy
// renderers are new for the NEAR integration.
'use strict';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// --- Folder: subjects ------------------------------------------------------

function renderSubjects(container, catalog, onSelect) {
  container.innerHTML = '';
  (catalog.subjects || []).forEach(function (subject) {
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.subjectId = subject.id;
    card.innerHTML =
      '<h3>' + esc(subject.name) + '</h3>' +
      '<p>' + esc(subject.summary || '') + '</p>' +
      '<span class="count">' + subject.fileCount + ' file' +
      (subject.fileCount === 1 ? '' : 's') + '</span>';
    card.addEventListener('click', function () { onSelect(subject.id); });
    container.appendChild(card);
  });
}

function markSelectedSubject(container, subjectId) {
  Array.prototype.forEach.call(container.querySelectorAll('.card'), function (card) {
    card.classList.toggle('selected', card.dataset.subjectId === subjectId);
  });
}

function renderUnfiled(container, unfiled, filesById) {
  if (!unfiled || unfiled.length === 0) { container.innerHTML = ''; return; }
  var names = unfiled.map(function (id) {
    var f = filesById[id];
    return f ? f.name : id;
  });
  container.innerHTML = '<p class="unfiled-note"><strong>' + unfiled.length +
    ' file' + (unfiled.length === 1 ? '' : 's') +
    ' did not fit any subject:</strong> ' + esc(names.join(', ')) +
    '. KATIE Guard leaves them unfiled rather than guessing where they belong.</p>';
}

// --- Folder: subject report + source viewer --------------------------------

function renderReport(container, report, onPointer) {
  var html = '<div class="report"><h3>' + esc(report.name) + '</h3>' +
    '<p>' + esc(report.summary || '') + '</p>' +
    '<p class="file-list">' + report.fileCount + ' file' +
    (report.fileCount === 1 ? '' : 's') + ' in this subject: ' +
    esc((report.files || []).map(function (f) { return f.name; }).join(', ')) + '</p>';
  if (report.note) html += '<p class="status">' + esc(report.note) + '</p>';
  (report.facts || []).forEach(function (fact) {
    html += '<div class="fact"><p>' + esc(fact.text) + '</p>' +
      '<button type="button" class="pointer" data-fact-id="' + esc(fact.id) + '">' +
      'Source: ' + esc(fact.source.fileName) + ' — ' + esc(fact.source.pointer) + '</button></div>';
  });
  html += '</div>';
  container.innerHTML = html;
  Array.prototype.forEach.call(container.querySelectorAll('.pointer'), function (btn) {
    btn.addEventListener('click', function () { onPointer(btn.dataset.factId); });
  });
}

// Show the source behind one fact: file name, pointer, the excerpt the
// fact quotes, and — when the pointer is a line number — the full line.
function renderSource(viewer, fact, fileText) {
  var fullLine = null;
  var m = /^line (\d+)$/.exec(fact.source.pointer || '');
  if (m && fileText) {
    var lines = fileText.split(/\r?\n/);
    fullLine = lines[Number(m[1]) - 1] || null;
  }
  viewer.hidden = false;
  viewer.innerHTML = '<h4>Source — ' + esc(fact.source.fileName) + ' (' +
    esc(fact.source.pointer) + ')</h4>' +
    '<blockquote>&ldquo;' + esc(fact.source.excerpt) + '&rdquo;</blockquote>' +
    (fullLine ? '<p class="full-line">Full line: ' + esc(fullLine.trim()) + '</p>' : '') +
    '<p class="full-line">This is the exact source the fact above came from. ' +
    'KATIE Guard never states a fact it cannot point back to like this.</p>';
  viewer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// --- Act 1: policy ----------------------------------------------------------

function renderPolicy(container, policy) {
  container.innerHTML = '<div class="policy-card"><h3>Current policy</h3><dl>' +
    '<dt>Per-payment cap</dt><dd>' + esc(policy.perPaymentCapNear) + ' NEAR</dd>' +
    '<dt>Daily cap</dt><dd>' + esc(policy.dailyCapNear) + ' NEAR</dd>' +
    '<dt>Human approval at or over</dt><dd>' + esc(policy.approvalThresholdNear) + ' NEAR</dd>' +
    '<dt>Allowlist</dt><dd>' + esc((policy.allowlist || []).join(', ') || 'none') + '</dd>' +
    '<dt>Stored</dt><dd>' + esc(policy.storedIn || 'memory only') + '</dd></dl></div>';
}

// --- Act 2/3: counterparty check -------------------------------------------

function decisionBadge(decision) {
  var cls = decision === 'allow' ? 'badge allow' : decision === 'warn' ? 'badge warn' : 'badge block';
  return '<span class="' + cls + '">' + esc(decision.toUpperCase()) + '</span>';
}

function renderCheck(container, check) {
  var html = '<div class="check-card"><h3>Counterparty check — ' +
    esc(check.accountId) + ' ' + decisionBadge(check.decision) + '</h3><ul class="reasons">';
  (check.reasons || []).forEach(function (r) {
    html += '<li><strong>[' + esc(r.signal) + ' / ' + esc(r.level) + ']</strong> ' +
      esc(r.text) + ' <em>Source: ' + esc(r.source) + '</em></li>';
  });
  html += '</ul>';
  var ev = check.evidence || {};
  html += '<dl class="evidence">' +
    '<dt>Blocklist</dt><dd>' + (ev.blocklist && ev.blocklist.hit ? 'HIT — see reason above' : 'checked, no hit') + '</dd>' +
    '<dt>NEAR testnet RPC</dt><dd>' + (ev.rpc && ev.rpc.available
      ? 'reachable; account ' + (ev.rpc.exists ? 'exists' : 'not found') + (ev.rpc.exists ? ', balance ' + esc(ev.rpc.balanceNear) + ' NEAR, ' + (ev.rpc.isContract ? 'contract' : 'no contract') + ', ' + (ev.rpc.accessKeys || []).length + ' key(s)' : '')
      : 'UNAVAILABLE — local evidence only' + (ev.rpc && ev.rpc.error ? ' (' + esc(ev.rpc.error) + ')' : '')) + '</dd>' +
    '<dt>Prior interactions (K-record)</dt><dd>' + esc(ev.priorInteractions ? (ev.priorInteractions.payments + ' payment(s), ' + ev.priorInteractions.blocks + ' block(s)') : 'none') + '</dd>' +
    '<dt>Contract code change</dt><dd>' + esc(ev.codeChange ? ev.codeChange.status : 'notChecked') + '</dd>' +
    '<dt>Account age / activity</dt><dd>not scored — not available via a plain RPC account view</dd>' +
    '<dt>Allowlist</dt><dd>' + (ev.allowlist && ev.allowlist.listed ? 'listed (human vouched)' : 'not listed') + '</dd></dl></div>';
  container.innerHTML = html;
}

// --- Act 3: guarded payment outcomes ---------------------------------------

function renderPayBlocked(container, data, blockedBy) {
  var reasons = data.reasons || (data.check && data.check.reasons) || [];
  var html = '<div class="pay-box blocked"><h3>Payment blocked ' + decisionBadge('block') + '</h3>' +
    '<p>Blocked by: <strong>' + esc(blockedBy || data.blockedBy || 'guard') + '</strong>. No transaction was signed.</p><ul class="reasons">';
  reasons.forEach(function (r) {
    html += '<li>' + esc(typeof r === 'string' ? r : r.text) + '</li>';
  });
  html += '</ul><p class="status">Recorded in the K-record as entry #' + esc(data.kRecordSeq) + ' — see Act 4.</p></div>';
  container.innerHTML = html;
}

function renderPayHeld(container, data, onConfirm) {
  var html = '<div class="pay-box held"><h3>Human confirmation needed ' + decisionBadge('warn') + '</h3>' +
    '<p>The guard is holding this payment. Nothing is signed yet. Read the reasons, then confirm — or walk away.</p><ul class="reasons">';
  (data.reasons || []).forEach(function (r) {
    html += '<li><strong>[' + esc(r.signal) + ']</strong> ' + esc(r.text) + '</li>';
  });
  (data.policyReasons || []).forEach(function (r) {
    html += '<li><strong>[policy]</strong> ' + esc(r) + '</li>';
  });
  html += '</ul><p><button type="button" class="btn big" id="confirm-btn">I confirm — sign offline</button></p>' +
    '<p class="status">Confirming signs OFFLINE ONLY with the ephemeral key. Nothing is broadcast; no tokens move. The confirmation is recorded in the K-record.</p></div>';
  container.innerHTML = html;
  container.querySelector('#confirm-btn').addEventListener('click', function () { onConfirm(); });
}

function renderSigned(container, data) {
  var sig = data.signature || {};
  var perm = sig.permission || {};
  var tx64 = sig.signedTransactionBase64 || '';
  container.innerHTML = '<div class="receipt-card"><h3>Guarded payment signed — OFFLINE ' + decisionBadge(data.decision || 'allow') + '</h3>' +
    '<p class="ok">&#10003; Signed offline. <strong>NOT broadcast. No tokens moved.</strong></p><dl>' +
    '<dt>Receiver</dt><dd>' + esc(sig.receiverId || '') + ' (demo contract target — no contract deployed)</dd>' +
    '<dt>Method</dt><dd>' + esc(sig.methodName || '') + '</dd>' +
    '<dt>Decision</dt><dd>' + esc(data.decision || '') + (data.humanConfirmed ? ' (human-confirmed)' : '') + '</dd>' +
    '<dt>Transaction hash</dt><dd><code>' + esc(sig.txHashBase58 || '') + '</code></dd>' +
    '<dt>Signature</dt><dd><code>' + esc((sig.signatureBase58 || '').slice(0, 44)) + '&hellip;</code></dd>' +
    '<dt>Ephemeral key</dt><dd><code>' + esc(sig.ephemeralPublicKey || '') + '</code><br>' + esc(sig.keyNote || '') + '</dd>' +
    '<dt>Block hash</dt><dd>' + esc(sig.blockHash ? sig.blockHash.source : '') + (sig.blockHash && sig.blockHash.height ? ' (height ' + esc(sig.blockHash.height) + ')' : '') + '</dd>' +
    '<dt>Gas / deposit</dt><dd>' + esc(sig.gas || '') + ' gas / ' + esc(sig.depositYocto || '0') + ' yocto (function-call keys cannot attach NEAR)</dd></dl>' +
    '<h4>Key permission — function-call, one contract, never full-access</h4>' +
    '<dl><dt>receiver_id</dt><dd><code>' + esc(perm.receiver_id || '') + '</code></dd>' +
    '<dt>method_names</dt><dd><code>' + esc((perm.method_names || []).join(', ')) + '</code></dd>' +
    '<dt>allowance</dt><dd>' + esc(perm.allowance || '') + ' yocto (' + esc(perm.allowanceNear || '') + ' NEAR gas budget)</dd>' +
    '<dt>key type</dt><dd>' + esc(perm.keyType || '') + '</dd></dl>' +
    '<details><summary>Signed transaction (' + esc(sig.signedTransactionBytes || '') + ' bytes, base64)</summary>' +
    '<p class="mono">' + esc(tx64) + '</p></details>' +
    '<p class="status">Recorded in the K-record as entry #' + esc(data.kRecordSeq) + ' — see Act 4. Old entries were not touched.</p></div>';
}

// --- Act 3: attack demo ------------------------------------------------------

function renderAttackLog(container, result) {
  var html = '<div class="pay-box ' + (result.blocked ? 'blocked' : 'held') + '"><h3>Attack demo — ' +
    (result.blocked ? 'BLOCKED ' + decisionBadge('block') : 'NOT BLOCKED — guard failure') + '</h3>' +
    '<pre class="attack-log">' + esc((result.log || []).join('\n')) + '</pre>' +
    '<p class="status">' + (result.entries || []).length + ' K-record entries appended (belief, block, authority) — see Act 4.</p></div>';
  container.innerHTML = html;
}

// --- Act 4: audit -----------------------------------------------------------

function renderAudit(container, report) {
  if (!report || !report.days || report.days.length === 0) {
    container.innerHTML = '<p class="status">Nothing in the K-record for ' +
      esc(report ? report.fromDate : '') + ' to ' + esc(report ? report.toDate : '') +
      '. Silence means nothing happened those days — not that the record is missing.</p>';
    return;
  }
  var html = '<p class="totals">' + report.totals.permissions + ' permission' +
    (report.totals.permissions === 1 ? '' : 's') + ' &middot; ' +
    report.totals.authority + ' authority change' +
    (report.totals.authority === 1 ? '' : 's') + ' &middot; ' +
    report.totals.beliefs + ' belief' + (report.totals.beliefs === 1 ? '' : 's') +
    ' &middot; ' + report.totals.payments + ' payment' +
    (report.totals.payments === 1 ? '' : 's') + ' &middot; ' +
    report.totals.blocks + ' block' + (report.totals.blocks === 1 ? '' : 's') + '</p>';
  if (report.changedSince && report.changedSince.length > 0) {
    html += '<div class="day"><h4>What changed</h4><ul>' +
      report.changedSince.map(function (c) {
        return '<li><strong>' + esc(c.date) + ' — ' + esc(c.kind) + ':</strong> ' + esc(c.text) + '</li>';
      }).join('') + '</ul></div>';
  }
  report.days.forEach(function (day) {
    html += '<div class="day"><h4>' + esc(day.date) + '</h4>';
    if (day.permissions.length) {
      html += '<h5>Permissions</h5><ul>' + day.permissions.map(function (t) {
        return '<li>' + esc(t) + '</li>';
      }).join('') + '</ul>';
    }
    if (day.authority.length) {
      html += '<h5>Authority / trust</h5><ul>' + day.authority.map(function (t) {
        return '<li>' + esc(t) + '</li>';
      }).join('') + '</ul>';
    }
    if (day.beliefs.length) {
      html += '<h5>Beliefs &amp; notes</h5><ul>' + day.beliefs.map(function (t) {
        return '<li>' + esc(t) + '</li>';
      }).join('') + '</ul>';
    }
    if (day.payments.length) {
      html += '<h5>Payments</h5><ul>' + day.payments.map(function (t) {
        return '<li>' + esc(t) + '</li>';
      }).join('') + '</ul>';
    }
    if (day.blocks.length) {
      html += '<h5>Blocks</h5><ul>' + day.blocks.map(function (t) {
        return '<li>' + esc(t) + '</li>';
      }).join('') + '</ul>';
    }
    html += '</div>';
  });
  html += '<p class="motto">' + esc(report.motto) + '</p>';
  container.innerHTML = html;
}

// Step indicator: highlight the section the user is in.
function setActiveStep(stepNumber) {
  Array.prototype.forEach.call(document.querySelectorAll('.steps a'), function (a) {
    a.classList.toggle('active', Number(a.dataset.step) === stepNumber);
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    esc: esc,
    renderSubjects: renderSubjects, markSelectedSubject: markSelectedSubject,
    renderUnfiled: renderUnfiled, renderReport: renderReport,
    renderSource: renderSource, renderPolicy: renderPolicy,
    renderCheck: renderCheck, renderPayBlocked: renderPayBlocked,
    renderPayHeld: renderPayHeld, renderSigned: renderSigned,
    renderAttackLog: renderAttackLog, renderAudit: renderAudit,
    setActiveStep: setActiveStep,
  };
}
