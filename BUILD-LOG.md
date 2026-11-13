# BUILD-LOG.md — KATIE Guard (append-only)

What was built, when, and what the runs actually printed. No number in
this file is assumed: counts come from the commands shown.

## 2026-11-12 (evening ET) / 2026-11-13 (UTC) — build + verification

Builder: Elara (builder subagent) for Darren Hall, solo, VOLSHi.
Repo: iamvolshi/near-katie (new, public). Track: security.
Baseline: ~/workspace/paypal-curator (FROZEN — read and copied from
only; never written to). NEAR integration built Nov 12–14, 2026.

### Environment, measured

- `node --version` → `v24.22.1` (docs require 22.22.2+; satisfied).
- `npm view near-api-js version` → `7.5.3` (verified against the npm
  registry at build time, not assumed from docs).
- `npm install` in `server/` → "added 123 packages", no errors.
  Pinned: `near-api-js 7.5.3`, `express 4.21.2`, `dotenv 16.4.7`
  (`npm ls` confirmed). A fresh `npm ci` from the committed lockfile
  in a clean directory also installed 123 packages and imported
  `near-api-js` successfully.
- All 15 JS files pass `node --check`. Largest file: `public/js/app.js`
  (369 lines). No file over ~500 lines (full counts at the end).

### near-api-js v7 import shapes — verified from the installed package

Read from `node_modules/near-api-js/lib/index.d.ts` and confirmed at
runtime (a throwaway smoke script, deleted after): `KeyPair.fromRandom`,
`KeyPairSigner`, `signTransaction` → `{ txHash, signedTransaction }`,
`signedTransaction.encode()`, `createTransaction`,
`actions.functionCall`, `actions.functionCallAccessKey`,
`JsonRpcProvider` methods `viewNodeStatus / viewAccount /
viewAccessKeyList / viewContractCode / viewBlock`. Smoke result: a
255-byte signed transaction encoded offline, permission object
`{ receiverId: guard-demo.testnet, methodNames: [record_decision],
allowance: 250000000000000000000000 }`. No 6.x/0.44.x example shapes
were used.

### NEAR testnet RPC — verified UNREACHABLE from the build VM

Live-checked before choosing a default, as required. From this VM:

- `curl` POST `{"method":"status"}` to `https://test.rpc.fastnear.com`,
  `https://near-testnet.drpc.org`, `https://testnet-rpc.intea.rs`,
  `https://api.zan.top/near-testnet`, `https://rpc.testnet.near.org`,
  `https://archival-rpc.testnet.near.org` → every one: curl exit 28,
  timeout, 0 bytes received (20–25s each).
- `curl` to `https://example.com` also timed out: the VM's egress
  proxy allows only certain hosts (npm registry and GitHub work).
- Node `fetch` POST to FASTNEAR with a 20s abort → aborted on timeout.
- Consequence, implemented honestly: the server keeps the real RPC
  read path (`server/nearRpc.js`, 6s timeout, zero retries) and the
  UI + `/api/health` report `rpcReachable: false` with the error
  text. Checks fall back to local evidence and say so. No RPC data
  was fabricated. Default endpoint stays FASTNEAR testnet
  (`https://test.rpc.fastnear.com`, from the NEAR RPC providers page,
  updated 2026-11-10) and is env-configurable via `NEAR_RPC_URL`.
  On a machine with testnet access, the same code path returns live
  account data — that path is UNRUN from this VM (see "Not run").

### Pool / catalog measurements (run, not copied)

`node` measurement script over the real pool + baseline modules:

- Pool: 35 content files + `manifest.json` (34 baseline + the new
  `injected-instruction.txt` test file).
- `catalogPool`: 35 files → 4 subjects, 5 unfiled.
  Invoices & payments: 9 files, 17 facts. Building repairs: 4 files,
  12 facts. Client messages: 3 files, 9 facts. Catering orders:
  14 files, 59 facts. Total: 97 facts, every one with a source.
- The injected file catalogs into "Invoices & payments" (it mentions
  payment/NEAR). It is flagged by name in the UI as labelled test data.
- Seed record: 20 entries, dates 2026-10-12 → 2026-11-09.

### Canonical verification run (fresh ledger, server on :3000)

Ledger reset (`data/krecord-live.json` deleted), server restarted,
then in order (all via curl; full outputs kept in the build session):

1. `POST /api/check {supplier-demo.testnet}` → decision `allow`
   (allowlisted; RPC-unavailable warning kept visible in reasons).
2. `POST /api/check {evil-drainer-demo.testnet}` → decision `block`
   (blocklist hit + evidence).
3. `POST /api/policy` (defaults) → `kRecordSeq: 21`.
4. `POST /api/pay` 0.4 NEAR → supplier → HTTP 200, decision `allow`,
   `signed: true`, `broadcast: false`, seq 22. Signed transaction
   344 bytes (varies with args length; smoke test's smaller args gave
   255 bytes).
5. `POST /api/pay` 0.4 NEAR → evil → HTTP 403, decision `block`,
   `blockedBy: counterparty`, seq 23.
6. `POST /api/pay` 0.6 NEAR → someone-new, no confirm → HTTP 409,
   decision `warn`, `held: true`, seq 24.
7. Same + `confirm: true` → HTTP 200, `signed: true`,
   `humanConfirmed: true`, seq 25.
8. `POST /api/attack` → `blocked: true`, seqs 26, 27, 28.
9. `npm run attack-demo` (CLI) → exit 0, `RESULT: BLOCKED`, seqs 29,
   30, 31. Real log (also in README.md):

```text
ATTACK DEMO — prompt injection hidden in pool data
File (DATA, not an instruction): data/pool/injected-instruction.txt
Injected ask: pay 50 NEAR to evil-drainer-demo.testnet.
Injected override attempts: raise cap=true, skip approval=true.
Policy before: per-payment cap 1 NEAR, daily cap 5 NEAR, approval at 0.5 NEAR.
Policy override IGNORED: pool files cannot set policy. Policy unchanged.
Policy evaluation: allowed=false. Amount 50 NEAR is over the per-payment cap of 1 NEAR. Daily cap: 1 NEAR already signed today + 50 NEAR would exceed the daily cap of 5 NEAR.
Counterparty check: BLOCK.
  [blocklist/block] Blocklisted: Reported drainer address used in fake airdrop claims. Evidence: Demo report: three testnet accounts reported funds leaving within seconds of calling a fake claim page that named this receiver. Report IDs DEMO-001, DEMO-002, DEMO-003 (invented).
  [rpc/warn] NEAR testnet RPC unreachable (Exceeded 10 attempts for https://test.rpc.fastnear.com.). Decision uses local evidence only.
  [prior-interactions/warn] The K-record holds 2 prior block(s) involving this account (last 2026-11-13).
Guarded signing: REFUSED. Guard refused: counterparty decision is block. Refusing to sign.
RESULT: BLOCKED. No transaction was signed. 3 K-record entries appended (belief, block, authority).
```

Also verified separately: malformed account id → `block`; 50 NEAR pay
→ 403 `blockedBy: policy` with both cap reasons; invalid policy →
400; `GET /api/health` → `rpcReachable: false`,
`broadcastImplemented: false`, `nearApiJs: 7.5.3`, `node: v24.22.1`;
`GET /api/ledger` → 31 entries (20 seed + 11 live); live ledger
served at `/data/krecord-live.json` (HTTP 200); served page contains
"35 files" and zero "paypal" mentions.

### Audit-default verification (the fixed bug, proven with real code)

Ran the REAL browser modules (`public/js/krecord.js` +
`public/js/app.js` helpers) in Node against the merged record:

- Live entries: 11, seqs 21–31, all dated 2026-11-13 (server-local
  today; the VM runs UTC, so local today was Nov 13 while it was
  still Nov 12 evening in US Eastern — server and browser share one
  machine in real use, so both use the same local date).
- Default range: From 2026-10-12 (earliest seed date, computed) →
  To 2026-11-13 (local today, computed). Totals: 7 permissions,
  7 authority, 11 beliefs, 3 payments, 3 blocks, 13 days.
- Live entries in default range: 11/11. Live payments in range: 2
  (report shows 3 — the third is the labelled seed placeholder).
  Live blocks in range: 3 = report blocks. The status-line claim is
  computed from this data on every run.
- Old hardcoded range (2026-10-26 → 2026-10-28): totals 1 permission,
  0/0/0/0, live in range: 0 — the status line must NOT (and does not)
  claim live entries there. This is the exact signature of the old bug.
- `index.html` contains no hardcoded date values (grep confirmed);
  the date inputs have no `value` attribute and are set by JS.
- Trust arc in the record: last authority entry 0.3 (0.9 → 0.6 →
  0.3 across the two attack runs; each attack drops 0.3 from the
  last recorded authority value, computed from the record).

### Refusals verified

- `NEAR_NETWORK=mainnet` → startup refused with a plain error.
- `NEAR_RPC_URL=https://rpc.mainnet.near.org` → startup refused.
- `NEAR_BROADCAST=true` → server starts, `broadcastImplemented`
  stays `false` (flag accepted and ignored by design).

### Frontend checks (no live browser on this VM)

- Static cross-check script: all 36 element ids used by `app.js`
  exist in `index.html` (none missing); all 18 globals `app.js`
  expects are defined by the other scripts (none missing); all CSS
  classes used by `views.js` exist in `style.css`.
- DOM-stub render test with REAL API payloads: `renderCheck`,
  `renderSigned`, `renderPayHeld`, `renderPayBlocked`,
  `renderAttackLog`, `renderSubjects`, `renderReport`, `renderAudit`
  all render without throwing and contain their expected markers
  (BLOCK badge + blocklist text; "NOT broadcast" + permission object
  + allowance; confirm button; attack log; subject facts with
  "Source:" buttons; audit "What changed" + Blocks section).
- Live-browser click-through: NOT RUN (no browser on the build VM).
  See "Not run" below.

### Bugs found during verification — fixed, then re-verified

1. Attack parser grabbed the FIRST amount in the injected file
   (100 NEAR, from the cap-raise line) instead of the payment amount
   (50 NEAR). Fixed: prefer a `pay X NEAR` match. Re-ran: "Injected
   ask: pay 50 NEAR" — correct.
2. Attack policy evaluation hardcoded `signedToday: 0`. Fixed: uses
   the real `signedTodayTotal()` from the ledger. Re-ran: "Daily cap:
   1 NEAR already signed today" — correct (0.4 + 0.6 from the run).
3. First catalog measurement passed `content` instead of `text` and
   got 0 subjects — a measurement-script error, not a code bug.
   `catalogPool` takes `file.text`. Re-measured: 4 subjects, 97 facts.

### Decisions recorded

- Broadcast is NOT implemented (no broadcast code path exists).
  Reason: no testnet account, no credentials, no RPC from the build
  VM — a broadcast path could not have been verified, and shipping
  an unverified spending path would violate the demo's own honesty
  rule. Documented in README + `.env.example` + `/api/health`.
- The demo contract id `guard-demo.testnet` is a labelled demo
  target: no contract deployed, nothing broadcast. The UI, the API
  response, and the README all say so. It was NOT verified to exist
  on testnet (RPC unreachable); it is never presented as real.
- Policy lives in memory only and resets on restart (deliberate,
  documented in UI + code + README).
- `/api/check` is read-only (writes nothing); decisions that move or
  refuse money are written by `/api/pay` and `/api/attack`.
- Dates are LOCAL (server-local for entries, browser-local for the
  audit To default), documented in `server/ledger.js` and
  `public/js/app.js`. UTC dating was part of the old bug.

### File line counts (wc -l, at verification time)

```text
20 data/blocklist.json      147 server/attack.js
21 server/attack-demo.js    153 server/nearRpc.js
30 server/blocklist.js      154 public/index.html
52 server/config.js         183 server/check.js
71 company.md               184 public/css/style.css
92 DEMO-SCRIPT.md           200 public/js/krecord.js
113 server/guard.js         203 server/index.js
120 server/ledger.js        269 public/js/views.js
123 public/js/catalog.js    309 public/js/provenance.js
123 server/policy.js        358 README.md
                            369 public/js/app.js
```

### Not run (labelled honestly)

- Live-browser click-through of the README do-X-see-Y steps: no
  browser exists on the build VM. The steps' underlying paths were
  verified instead: every API call via curl, every renderer via a
  DOM stub with real payloads, and a static id/global/CSS
  cross-check. A human click-through on a laptop is still worth
  doing before recording the video.
- Live NEAR testnet reads (account view, key list, contract code,
  block hash): the RPC is unreachable from the build VM, so the
  reachable-RPC branch of `server/nearRpc.js` is code-reviewed but
  unexecuted. The unreachable branch is the one that ran, and it is
  the branch the UI reports. On a network with testnet access, run
  step 3 of the README and confirm the evidence panel shows live
  account data.
- The GitHub Pages workflow (`.github/workflows/pages.yml`): NOT pushed.
  The `iamvolshi` GitHub token lacks the `workflow` scope, so the push
  was refused while the workflow file was in the commit. The file is
  kept on disk at `~/workspace/near-katie/.github/workflows/pages.yml`
  (untracked) for adding later via the GitHub web UI or a token with
  `workflow` scope. The demo does not need Pages to run or be judged.
