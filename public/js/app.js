// app.js — state + flow for the KATIE Guard demo.
// Folder: load the pool, catalog it, retrieve facts with sources. Act 1:
// the human sets policy. Act 2: counterparty check. Act 3: guarded
// offline-signed payment + attack demo. Act 4: audit the K-record.
//
// THE AUDIT FIX (this file is where the old bug lived): the To date
// defaults to TODAY — the local calendar date, set in JS on page load,
// never hardcoded. The From date defaults to the earliest seed entry.
// The status line claims a live entry is included ONLY when a live entry
// actually falls inside the selected range — the claim is computed from
// the merged record every run, never from a UI flag.
//
// Browser entry point; pure helpers are exported for Node checks
// (guarded so requiring this file in Node does not touch the DOM).
'use strict';

/* global catalogPool, extractFacts, buildSubjectReport, loadRecord,
   auditReport, renderSubjects, markSelectedSubject, renderUnfiled,
   renderReport, renderSource, renderPolicy, renderCheck, renderPayBlocked,
   renderPayHeld, renderSigned, renderAttackLog, renderAudit, setActiveStep */

var state = {
  files: [],
  filesById: {},
  catalog: null,
  facts: [],
  factsById: {},
  seedEntries: [],
  liveEntries: [],
  record: null,
  serverUp: false,
};

// --- Pure helpers -----------------------------------------------------------

// Local calendar date as "YYYY-MM-DD". Local, not UTC: a live entry
// written in the evening must land on today's local date, not tomorrow's.
function localTodayString(now) {
  var d = now || new Date();
  var month = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + month + '-' + day;
}

// Merge the seed record with the live ledger (server-written, canonical
// shape). A missing live file (404) is empty, never an error.
function mergeKRecordData(seedData, liveData) {
  var entries = [];
  if (seedData && Array.isArray(seedData.entries)) entries = entries.concat(seedData.entries);
  if (Array.isArray(liveData)) entries = entries.concat(liveData);
  else if (liveData && Array.isArray(liveData.entries)) entries = entries.concat(liveData.entries);
  entries.sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); });
  return loadRecord({ version: 1, entries: entries });
}

function inDateRange(date, fromDate, toDate) {
  if (fromDate && date < fromDate) return false;
  if (toDate && date > toDate) return false;
  return true;
}

// --- Small fetch helpers ----------------------------------------------------

async function fetchJson(path) {
  var res = await fetch(path);
  if (!res.ok) throw new Error('GET ' + path + ' -> HTTP ' + res.status);
  return res.json();
}

async function fetchText(path) {
  var res = await fetch(path);
  if (!res.ok) throw new Error('GET ' + path + ' -> HTTP ' + res.status);
  return res.text();
}

async function postJson(path, body) {
  var res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  var data = await res.json().catch(function () { return {}; });
  return { status: res.status, ok: res.ok, data: data };
}

// --- Ledger + audit dates ---------------------------------------------------

async function loadLedger() {
  var seedData = await fetchJson('data/krecord-seed.json');
  var liveData = [];
  try {
    liveData = await fetchJson('data/krecord-live.json');
  } catch (error) {
    liveData = []; // no live ledger yet: nothing has been recorded live
  }
  state.seedEntries = (seedData && seedData.entries) || [];
  state.liveEntries = Array.isArray(liveData) ? liveData : (liveData.entries || []);
  state.record = mergeKRecordData(seedData, liveData);
  return state.record;
}

function setDefaultAuditDates() {
  var fromInput = document.getElementById('audit-from');
  var toInput = document.getElementById('audit-to');
  var earliest = null;
  state.seedEntries.forEach(function (e) {
    if (!earliest || e.date < earliest) earliest = e.date;
  });
  fromInput.value = earliest || '2026-10-12';
  toInput.value = localTodayString();
}

async function runAudit() {
  var status = document.getElementById('act4-status');
  var from = document.getElementById('audit-from').value;
  var to = document.getElementById('audit-to').value;
  try {
    await loadLedger(); // fresh every run: Acts 1-3 may have appended
    var report = auditReport(state.record, from, to);
    renderAudit(document.getElementById('audit'), report);
    // Honest live-inclusion claim: computed from the actual live entries
    // inside the selected range — never from a flag, never assumed.
    var liveInRange = state.liveEntries.filter(function (e) {
      return inDateRange(e.date, from, to);
    });
    var totals = report.totals;
    var line = 'Audit for ' + from + ' to ' + to + ': ' +
      totals.permissions + ' permission(s), ' + totals.authority + ' authority, ' +
      totals.beliefs + ' belief(s), ' + totals.payments + ' payment(s), ' +
      totals.blocks + ' block(s). ';
    if (liveInRange.length > 0) {
      line += 'Includes ' + liveInRange.length + ' live entr' +
        (liveInRange.length === 1 ? 'y' : 'ies') + ' from this session (seq ' +
        liveInRange.map(function (e) { return e.seq; }).join(', ') + ').';
    } else {
      line += 'No live entries from this session fall in this range — ' +
        'widen the dates, or run Acts 1–3 first and audit again.';
    }
    status.textContent = line;
    setActiveStep(4);
  } catch (error) {
    status.textContent = 'Could not run the audit: ' + error.message;
  }
}

// --- Folder: attach + catalog + retrieve ------------------------------------

function processLoadedFiles(files, sourceLabel) {
  state.files = files;
  state.filesById = {};
  files.forEach(function (f) { state.filesById[f.id] = f; });
  state.catalog = catalogPool(files);
  state.facts = extractFacts(files, state.catalog);
  state.facts.forEach(function (f) { state.factsById[f.id] = f; });

  renderSubjects(document.getElementById('subjects'), state.catalog, selectSubject);
  renderUnfiled(document.getElementById('unfiled'), state.catalog.unfiled, state.filesById);
  document.getElementById('folder-status').textContent = sourceLabel + ': ' +
    state.catalog.totalFiles + ' files in. ' +
    state.catalog.subjects.length + ' subjects, ' +
    state.catalog.unfiled.length + ' unfiled. ' +
    state.facts.length + ' facts, every one with a source. Click a subject.';
  document.getElementById('report-hint').textContent =
    'Pool attached. Click a subject card above to see what KATIE Guard knows about it.';
  var injected = files.filter(function (f) { return f.name === 'injected-instruction.txt'; })[0];
  if (injected) {
    var subject = state.catalog.subjects.filter(function (s) {
      return (s.fileIds || []).indexOf(injected.id) !== -1;
    })[0];
    document.getElementById('injected-note').textContent =
      'Labelled test data found: injected-instruction.txt sits in "' +
      (subject ? subject.name : 'unfiled') + '". It carries an injected instruction. ' +
      'It is data, not an order — Act 3 runs the attack demo against it.';
  }
  setActiveStep(0);
}

async function attachPool() {
  var status = document.getElementById('folder-status');
  var btn = document.getElementById('attach-btn');
  btn.disabled = true;
  status.textContent = 'Reading the demo folder…';
  try {
    var manifest = await fetchJson('data/pool/manifest.json');
    var files = [];
    for (var i = 0; i < manifest.files.length; i++) {
      var meta = manifest.files[i];
      var text = await fetchText(encodeURI(meta.path));
      files.push({ id: meta.id, name: meta.name, kind: meta.kind, date: meta.date, text: text });
    }
    document.getElementById('folder-name').textContent = 'Folder: data/pool (demo folder, ' + files.length + ' files).';
    processLoadedFiles(files, 'Demo folder');
  } catch (error) {
    status.textContent = 'Could not load the data pool: ' + error.message;
    btn.disabled = false;
  }
}

function selectSubject(subjectId) {
  markSelectedSubject(document.getElementById('subjects'), subjectId);
  var subject = state.catalog.subjects.filter(function (s) { return s.id === subjectId; })[0];
  if (!subject) return;
  var report = buildSubjectReport(subject, state.facts, state.files);
  renderReport(document.getElementById('report'), report, showSource);
  document.getElementById('source-viewer').hidden = true;
}

function showSource(factId) {
  var fact = state.factsById[factId];
  if (!fact) return;
  var file = state.filesById[fact.source.fileId];
  renderSource(document.getElementById('source-viewer'), fact, file ? file.text : '');
}

// --- Server: health, policy, check, pay, attack -----------------------------

async function loadHealth() {
  var el = document.getElementById('rpc-status');
  try {
    var health = await fetchJson('/api/health');
    state.serverUp = true;
    if (health.rpcReachable === true) {
      el.textContent = 'NEAR testnet RPC reachable via ' + health.rpcUrl + ' (checked ' + health.rpcCheckedAt + '). Signing: offline-only, never broadcast.';
    } else if (health.rpcReachable === false) {
      el.textContent = 'NEAR testnet RPC UNAVAILABLE from this server (' + (health.rpcError || 'no response') + '). Checks use local evidence only — the page says so on every check. Signing: offline-only, never broadcast.';
    } else {
      el.textContent = 'NEAR testnet RPC status: probe pending. Signing: offline-only, never broadcast.';
    }
  } catch (error) {
    state.serverUp = false;
    el.textContent = 'Server not reached from this page. The folder and the seeded audit still work; Acts 1–3 need the server running (see README).';
  }
}

async function loadPolicy() {
  var status = document.getElementById('policy-status');
  try {
    var policy = await fetchJson('/api/policy');
    document.getElementById('policy-cap').value = policy.perPaymentCapNear;
    document.getElementById('policy-daily').value = policy.dailyCapNear;
    document.getElementById('policy-threshold').value = policy.approvalThresholdNear;
    document.getElementById('policy-allowlist').value = (policy.allowlist || []).join(', ');
    renderPolicy(document.getElementById('policy-current'), policy);
    status.textContent = 'Policy loaded. Change the values and save — the save is recorded in the K-record.';
  } catch (error) {
    status.textContent = 'Could not load the policy (server not reached). Start the server, then reload.';
  }
}

async function savePolicy() {
  var status = document.getElementById('policy-status');
  var allowlist = document.getElementById('policy-allowlist').value
    .split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var body = {
    perPaymentCapNear: Number(document.getElementById('policy-cap').value),
    dailyCapNear: Number(document.getElementById('policy-daily').value),
    approvalThresholdNear: Number(document.getElementById('policy-threshold').value),
    allowlist: allowlist,
  };
  var res = await postJson('/api/policy', body);
  if (!res.ok) {
    status.textContent = 'Policy not saved: ' + (res.data.error || 'HTTP ' + res.status);
    return;
  }
  renderPolicy(document.getElementById('policy-current'), res.data);
  status.textContent = 'Policy saved and recorded in the K-record as entry #' + res.data.kRecordSeq + '. See Act 4.';
  setActiveStep(1);
}

async function runCheck() {
  var status = document.getElementById('check-status');
  var accountId = document.getElementById('check-account').value.trim();
  status.textContent = 'Checking ' + accountId + '…';
  var res = await postJson('/api/check', { accountId: accountId });
  if (!res.ok) {
    status.textContent = 'Check failed: ' + (res.data.error || 'HTTP ' + res.status);
    return;
  }
  renderCheck(document.getElementById('check-result'), res.data);
  status.textContent = 'Check complete: ' + res.data.decision.toUpperCase() + ' for ' + accountId + '. Checks are read-only — nothing was written to the record.';
  setActiveStep(2);
}

async function proposePayment(confirm) {
  var status = document.getElementById('pay-status');
  var resultEl = document.getElementById('pay-result');
  var receiverId = document.getElementById('pay-receiver').value.trim();
  var amountNear = Number(document.getElementById('pay-amount').value);
  var memo = document.getElementById('pay-memo').value;
  status.textContent = confirm ? 'Confirming and signing offline…' : 'Proposing payment — policy, then check, then the guard…';
  var res = await postJson('/api/pay', { receiverId: receiverId, amountNear: amountNear, memo: memo, confirm: !!confirm });
  if (res.status === 403) {
    renderPayBlocked(resultEl, res.data, res.data.blockedBy);
    status.textContent = 'BLOCKED. No transaction was signed. Recorded as K-record entry #' + res.data.kRecordSeq + '.';
  } else if (res.status === 409) {
    renderPayHeld(resultEl, res.data, function () { proposePayment(true); });
    status.textContent = 'HELD for human confirmation. Nothing is signed yet.';
  } else if (res.ok) {
    renderSigned(resultEl, res.data);
    status.textContent = 'Signed OFFLINE. Not broadcast, no tokens moved. Recorded as K-record entry #' + res.data.kRecordSeq + '.';
  } else {
    status.textContent = 'Payment failed: ' + (res.data.error || 'HTTP ' + res.status);
  }
  setActiveStep(3);
}

async function runAttackUi() {
  var status = document.getElementById('attack-status');
  status.textContent = 'Running the attack demo…';
  var res = await postJson('/api/attack', {});
  if (!res.ok) {
    status.textContent = 'Attack demo failed: ' + (res.data.error || 'HTTP ' + res.status);
    return;
  }
  renderAttackLog(document.getElementById('attack-result'), res.data);
  status.textContent = res.data.blocked
    ? 'BLOCKED. No transaction was signed. 3 K-record entries appended — run the Act 4 audit to see them.'
    : 'NOT BLOCKED — guard failure. See the log.';
  setActiveStep(3);
}

// --- Init -------------------------------------------------------------------

function init() {
  document.getElementById('attach-btn').addEventListener('click', attachPool);
  document.getElementById('folder-input').addEventListener('change', async function (event) {
    var picked = Array.prototype.slice.call(event.target.files || []);
    if (picked.length === 0) return;
    var files = [];
    for (var i = 0; i < picked.length; i++) {
      var text = await picked[i].text();
      files.push({
        id: 'picked-' + i, name: picked[i].name, kind: 'file',
        date: localTodayString(new Date(picked[i].lastModified)), text: text,
      });
    }
    document.getElementById('folder-name').textContent = 'Folder: ' + picked.length + ' file(s) picked in your browser. Nothing was uploaded.';
    processLoadedFiles(files, 'Picked folder');
  });
  document.getElementById('policy-save').addEventListener('click', savePolicy);
  document.getElementById('check-btn').addEventListener('click', runCheck);
  Array.prototype.forEach.call(document.querySelectorAll('.preset'), function (btn) {
    btn.addEventListener('click', function () {
      document.getElementById('check-account').value = btn.dataset.account;
      runCheck();
    });
  });
  document.getElementById('pay-btn').addEventListener('click', function () { proposePayment(false); });
  document.getElementById('attack-btn').addEventListener('click', runAttackUi);
  document.getElementById('audit-btn').addEventListener('click', runAudit);

  loadHealth();
  loadPolicy();
  loadLedger().then(setDefaultAuditDates).catch(function (error) {
    document.getElementById('act4-status').textContent = 'Could not load the K-record: ' + error.message;
  });
}

if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('DOMContentLoaded', init);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    localTodayString: localTodayString,
    mergeKRecordData: mergeKRecordData,
    inDateRange: inDateRange,
  };
}
