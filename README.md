# KATIE Guard — NEAR Hackathon 2026, Security track

An agent that pays on NEAR must check before it pays. KATIE Guard is the
check: a human-set policy, a counterparty check that returns allow / warn /
block with reasons, and a guarded signing wrapper that refuses to sign on
block, asks a human on warn, and signs offline with a function-call key
scoped to one contract. Every decision lands in an append-only K-record
that never rewrites what the agent believed.

Solo builder: Darren Hall (VOLSHi). Track: 06 Security (AI Security &
Defense). Network: NEAR testnet only. License: MIT (see `LICENSE`).

## What it is

A single-page demo plus a small Node server. Four acts:

1. **POLICY** — the human sets a per-payment cap, a daily cap, a
   human-approval threshold, and an allowlist. Only this form can change
   the policy. Saving writes a K-record permission entry.
2. **CHECK** — the counterparty check: allow / warn / block + reasons,
   from the blocklist, NEAR testnet RPC reads, prior K-record
   interactions, and contract code-change comparison.
3. **PAY (guarded)** — the agent proposes a payment. Policy runs first,
   then the check, then the guarded signing wrapper. On block, the
   wrapper refuses to sign. On warn, a human must confirm. Signing is
   offline-only with an ephemeral in-memory keypair; the signed
   transaction is shown, never broadcast. No tokens move. The same act
   runs the prompt-injection attack demo.
4. **AUDIT** — the K-record by date. Old entries are never edited. When
   the agent was wrong, the correction is a new entry and the wrong
   belief stays in the log.

A folder prelude (act 0) catalogs the 35-file demo pool by content and
retrieves facts with source pointers, reusing the baseline demo code.

## The problem

AI agents that can pay are one injected instruction away from paying the
wrong address. A note in a messy folder, a pasted message, a fake support
email can tell the agent to raise its own limits and send money to a
scammer. KATIE Guard puts three things between the instruction and the
signature: the human's policy (which pool data can never change), a
counterparty check with named evidence, and a signing wrapper that only
holds a key scoped to one contract — plus a record that keeps the wrong
belief, the block, and the trust drop where anyone can audit them.

## How NEAR fits, concretely

- **Testnet RPC reads** (`server/nearRpc.js`, via `near-api-js` 7.5.3
  `JsonRpcProvider`): `viewAccount` (exists, balance, code hash),
  `viewAccessKeyList` (keys + permissions on the account),
  `viewContractCode` (whether the account hosts a contract),
  `viewNodeStatus` (reachability probe), `viewBlock` (latest final block
  hash for offline signing). Default endpoint
  `https://test.rpc.fastnear.com`, overridable with `NEAR_RPC_URL`.
  If the RPC is unreachable, the UI and the check say
  "RPC unavailable — local evidence only" and decide from local evidence.
  Nothing is faked.
- **Function-call access keys** (`server/guard.js`): signing uses a key
  whose permission is `{ receiver_id, method_names, allowance }` scoped
  to one demo contract id. See "Function-call key limits" below.
- **Offline signing**: the transaction is built with
  `createTransaction` + `actions.functionCall` and signed with an
  ephemeral `KeyPair` + `KeyPairSigner`. The signed bytes, transaction
  hash, signature, permission object, and block-hash source are shown.
  There is no broadcast code path in this prototype, so nothing here can
  become a real transaction.
- **Testnet only**: the server refuses to start with any
  `NEAR_NETWORK` other than `testnet`, and refuses RPC URLs containing
  `mainnet`. There is no mainnet path.

## Baseline disclosure (organizer rules Q-002 / Q-003 / Q-005)

- **Existing product, new feature.** The catalog / provenance / demo
  K-record base is the PayPal Curator demo built Nov 9–12, 2026
  (iamvolshi/paypal-curator, frozen after its submission). The NEAR
  integration — policy engine, counterparty check, guarded signing,
  attack demo, blocklist, reframed UI, and this README — was built
  Nov 12–14, 2026, inside the hackathon code window. Only the NEAR
  integration is the judged work.
- **Reused baseline files** (copied, headers rebranded, logic unchanged
  except where noted): `public/js/catalog.js` (content clustering),
  `public/js/provenance.js` (fact extraction with source pointers),
  `public/js/krecord.js` (demo K-record; extended with a `block` kind
  for the guard), `public/css/style.css`, `data/pool/` (34 seeded files),
  `data/krecord-seed.json` (20 entries, Oct 12–Nov 9, 2026; actor
  rebranded, placeholder entry reworded), `LICENSE`, `.gitignore`
  pattern, GitHub Pages workflow pattern, and the Express skeleton shape
  of `server/index.js`. The PayPal code, routes, UI, and credentials
  were left behind entirely — no PayPal code exists in this repo.
- **New files for the NEAR integration**: `server/config.js`,
  `server/ledger.js`, `server/policy.js`, `server/blocklist.js`,
  `server/nearRpc.js`, `server/check.js`, `server/guard.js`,
  `server/attack.js`, `server/attack-demo.js`, `server/index.js`
  (rewritten around the skeleton), `public/index.html`,
  `public/js/views.js`, `public/js/app.js` (rewritten),
  `data/blocklist.json`, `data/pool/injected-instruction.txt`
  (labelled test data), `company.md`, `DEMO-SCRIPT.md`, `BUILD-LOG.md`.
- **Libraries / templates**: `near-api-js` 7.5.3 (pinned),
  `express` 4.21.2 (pinned), `dotenv` 16.4.7 (pinned) — see
  `server/package.json` and `server/package-lock.json`. No starter
  template. AI assistance was used to write code in this window; every
  behavior below was run and verified by the builder (see BUILD-LOG.md).
- **The demo K-record is a simplified demo record**: plain JSON entries
  `{ seq, date, kind, actor, text, trust, source? }`, append-only by
  convention in this codebase. It is NOT the production KATIE kernel.
  It is described as a demo record everywhere it appears.

## Run it

Requirements: Node.js 22.22.2 or newer (built and verified on Node
v24.22.1). No build step, no bundler, no secrets for the default demo.

```sh
cd server
npm install
npm start
```

Open http://localhost:3000. The server listens on `PORT` (default 3000).
Copy `.env.example` to `server/.env` only if you want to change the RPC
endpoint; the defaults run with no `.env` at all.

## Do X — see Y (every step was run; expected results are exact)

Setup: server running, page open. The RPC status line at the top reports
the truth about testnet reachability from the machine running the server.
On the build machine the RPC was unreachable, so checks showed the
"local evidence only" warning; on a machine with testnet access, the
same steps show live account data instead. Both are correct behavior.

1. **Do:** click "Use the demo folder (35 files)".
   **See:** "35 files in. 4 subjects, 5 unfiled. 97 facts, every one
   with a source." Four subject cards. A note names
   `injected-instruction.txt` and the subject it sits in
   ("Invoices & payments"). Click a subject card: facts with
   "Source: file — line N" buttons. Click a source button: the exact
   excerpt and full line.
2. **Do:** in Act 1, leave the defaults (caps 1 / 5 / 0.5, allowlist
   `supplier-demo.testnet`) and click "Save policy".
   **See:** "Policy saved and recorded in the K-record as entry #21."
   (Entry number is 21 on a fresh ledger: 20 seed entries + 1.)
3. **Do:** in Act 2, check `supplier-demo.testnet`.
   **See:** decision **ALLOW**, with reasons: the RPC warning (if the
   RPC is unreachable) plus "Allowlisted by the human in the Act 1
   policy." Evidence lists blocklist (no hit), RPC status, prior
   interactions, code change (notChecked), account age (not scored),
   allowlist (listed).
4. **Do:** in Act 2, check `evil-drainer-demo.testnet`.
   **See:** decision **BLOCK**, with the blocklist reason + evidence
   quoted. Checks are read-only: no K-record entry is written.
5. **Do:** in Act 2, check `someone-new.testnet`.
   **See:** decision **WARN** (RPC unreachable, unknown counterparty,
   no prior interactions) — or, on a machine with RPC access, WARN for
   "account not found" if the account does not exist.
6. **Do:** in Act 3, pay 0.4 NEAR to `supplier-demo.testnet`, memo
   "demo supplier payment". Click "Propose payment".
   **See:** "Signed OFFLINE. NOT broadcast, no tokens moved." The
   permission object (`receiver_id: guard-demo.testnet`,
   `method_names: [record_decision]`, allowance `0.25` NEAR), the
   ephemeral public key, the transaction hash, the signature, the
   signed transaction bytes, and "Recorded in the K-record as entry
   #22." The receiver is labelled a demo contract target: no contract
   is deployed there and nothing is broadcast.
7. **Do:** in Act 3, pay 0.4 NEAR to `evil-drainer-demo.testnet`.
   **See:** HTTP 403 in the page as "Payment blocked — BLOCK.
   Blocked by: counterparty. No transaction was signed." Recorded as
   entry #23 (kind `block`).
8. **Do:** in Act 3, pay 0.6 NEAR to `someone-new.testnet`. Click
   "Propose payment". Then click "I confirm — sign offline".
   **See:** first "HELD for human confirmation. Nothing is signed
   yet." with the warn reasons (entry #24, kind `belief`). After
   confirming: signed offline, human-confirmed, entry #25.
9. **Do:** in Act 3, click "Run the attack demo".
   **See:** the attack log ending in "RESULT: BLOCKED. No transaction
   was signed. 3 K-record entries appended (belief, block, authority)."
   Entries #26–#28. The same demo runs from the terminal (see below).
10. **Do:** in Act 4, leave the default dates and click "Run audit".
    **See:** the From date defaults to 2026-10-12 (earliest seed
    entry) and the To date defaults to today (your local date, set in
    JS on page load — never hardcoded). After steps 2–9 plus the
    terminal attack demo below, the totals read: 7 permissions,
    7 authority, 11 beliefs, 3 payments, 3 blocks, across 13 days.
    The status line reads: "Includes 11 live entries from this
    session (seq 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31)."
    The claim is computed from the live entries actually inside the
    range: narrow the range to exclude today and the line instead
    says no live entries fall in the range. (The 3 payments include
    the 1 labelled placeholder in the seed plus the 2 live
    offline-signed payments.)

## Attack demo (terminal)

```sh
cd server
npm run attack-demo
```

The script reads `data/pool/injected-instruction.txt` **as data** — the
file is labelled test data, never an instruction. It extracts what the
note asks for (pay 50 NEAR to `evil-drainer-demo.testnet`, raise the
cap, skip approval), then runs the same guard path as a real payment:
policy evaluation, counterparty check, guarded signing. Expected: the
policy override is ignored, the check returns block, signing is
refused, exit code 0 with BLOCKED printed. (Exit code 1 would mean the
guard failed to block.) Real output from the verification run
(Nov 12–13, 2026; the `[rpc/warn]` line appears only when the RPC is
unreachable from the build machine):

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

## Counterparty check: data sources per signal

| Signal | Data source | How obtained |
|---|---|---|
| Account-id shape | Local validation (`server/policy.js`) | Regex + length rules; shape only, never existence |
| Shared blocklist | `data/blocklist.json` | Committed JSON, re-read per check; each entry carries reason, evidence, reporter, date. **Demo data, invented — not real threat intelligence.** A hit is a hard block. |
| Account exists / balance / keys / contract | NEAR testnet RPC | `near-api-js` `JsonRpcProvider`: `viewAccount`, `viewAccessKeyList`, `viewContractCode` against `NEAR_RPC_URL` (default FASTNEAR testnet). Unreachable → `available: false`, decision uses local evidence only, and the UI says so. |
| Prior agent–receiver interactions | K-record (seed + live) | `server/ledger.js` merges `data/krecord-seed.json` + `data/krecord-live.json`; counts payment/block entries naming the account. |
| Contract code change | K-record + RPC | Current code hash from `viewAccount` compared ONLY with a hash previously recorded in a K-record entry (`source.codeHash`). No prior hash → "notChecked". A change → warn. |
| Human allowlist | Human-set policy (`POST /api/policy`) | In-memory only; resets to defaults on restart. Can allow a check when the RPC is unreachable; can never override a blocklist hit. |
| Account age / activity history | — | **Not scored.** Not available from a plain RPC account view. Reported as "not scored", never estimated. |

Decision rules: block wins (malformed id, blocklist hit). Then warn
(account not found, RPC unavailable and not allowlisted, prior blocks,
code changed, contract holding a full-access key). Otherwise allow.
Full rules in `server/check.js`.

## Function-call key limits (NEAR access-keys docs)

Per the NEAR docs (protocol/accounts-contracts/access-keys, updated
2026-10-22), a function-call access key:

- can only sign transactions calling a **specific contract**
  (`receiver_id`), with optional `method_names` (omitted = all methods
  on that contract) and an optional `allowance` gas budget (omitted =
  unlimited);
- does **not** allow attaching NEAR tokens — this demo signs with a
  0 deposit, matching that limit;
- if it is the account's only key type: an account with **no**
  full-access keys and only function-call keys **cannot** transfer
  NEAR, delete itself, or manage its own keys; it can only perform
  the specific contract calls; it cannot be recovered or reconfigured
  through standard transactions;
- if a set allowance is fully consumed, the key becomes **unusable**
  (allowance 0: every transaction fails with NotEnoughAllowance).

This demo shows the permission object
`{ receiver_id, method_names, allowance }` on every signing, uses an
allowance of 0.25 NEAR, and never holds or shows a full-access key.
The demo contract id `guard-demo.testnet` has no contract deployed and
nothing is broadcast — it is a labelled demo target, and the UI says so.

## API

- `GET /api/health` — `{ ok, service, network, rpcUrl, rpcReachable,
  rpcCheckedAt, rpcError, broadcastImplemented: false, broadcast: false,
  signing, nearApiJs, node, time }`. RPC reachability is probed in the
  background (startup + every 60s) so health never blocks on a dead
  endpoint.
- `GET /api/policy` / `POST /api/policy` — read / human-set the policy.
  Setting writes a K-record permission entry. Invalid input → 400.
- `POST /api/check` — `{ accountId }` → `{ decision, reasons, evidence }`.
  Read-only: writes nothing.
- `POST /api/pay` — `{ receiverId, amountNear, memo?, confirm? }` →
  200 signed (offline), 403 blocked (policy or counterparty), 409 held
  (warn without confirmation). Every outcome writes a K-record entry.
- `POST /api/attack` — runs the attack demo server-side (same path as
  the CLI), returns `{ blocked, log, entries, check, ... }`.
- `GET /api/ledger` — merged seed + live entries.

## What is seeded vs live

**Seeded (committed, invented demo data):** `data/pool/` (35 files:
34 baseline + the injected test file), `data/krecord-seed.json`
(20 entries, Oct 12–Nov 9, 2026), `data/blocklist.json` (2 entries),
default policy values, demo account ids (`supplier-demo.testnet`,
`evil-drainer-demo.testnet`, `phish-claim-demo.testnet`,
`guard-demo.testnet`, `guard-demo-signer.testnet` — none are real
accounts under our control; the blocklisted names are invented).

**Live (created at runtime, never committed):**
`data/krecord-live.json` (gitignored; every policy save, payment,
block, hold, and attack run appends entries), the in-memory policy,
and RPC reads (when reachable). The ephemeral signing keypair exists
only in memory during one signing call and is never stored.

## Broadcast

There is no broadcast path in this prototype. `NEAR_BROADCAST` is a
reserved, unused variable: any value leaves the server offline-sign
only, and `/api/health` reports `broadcastImplemented: false`. No
tokens are spent, no contracts are deployed, no NEAR account was
created for this demo, and no real transaction is ever signed without
explicit human confirmation — the default flow signs offline artifacts
only. Adding a broadcast path would need a funded testnet account, a
stored function-call key, and a human confirmation gate; it is
deliberately out of scope for this entry.

## Audit-date note (bug fixed, not repeated)

The baseline demo hardcoded audit dates (Oct 26–28) while dating live
entries with the current day, so the default audit silently excluded
live entries while its status line claimed they were included. This
repo fixes it three ways: the To date defaults to today (local date,
set in JS on page load), the From date defaults to the earliest seed
entry, and the status line claims live entries are included only when
live entries actually fall inside the selected range — checked in code
against the merged record on every run. Verified end to end; see
BUILD-LOG.md.

## Repo layout

```text
public/            single-page demo (no build step)
  index.html       folder prelude + 4 acts
  css/style.css    baseline stylesheet + guard additions
  js/catalog.js    baseline: content clustering (35 files -> 4 subjects)
  js/provenance.js baseline: facts with source pointers (97 facts)
  js/krecord.js    baseline demo K-record + block kind
  js/views.js      renderers (check / pay / attack / audit)
  js/app.js        flow + audit-date fix
server/            Node + Express API (ESM, one concept per file)
  index.js         routes + static mounts + background RPC probe
  config.js        env config, testnet-only refusal
  ledger.js        append-only K-record, local dates
  policy.js        human-set policy + evaluation
  blocklist.js     shared blocklist loader
  nearRpc.js       testnet reads via near-api-js, honest failure
  check.js         counterparty check (allow/warn/block + reasons)
  guard.js         guarded offline signing, function-call key
  attack.js        injection attack path (CLI + API share it)
  attack-demo.js   npm run attack-demo
data/
  pool/            35 seeded files + manifest.json
  krecord-seed.json  20 seeded entries
  blocklist.json   2 seeded demo entries with evidence
  krecord-live.json  runtime only, gitignored, never committed
```

## License

MIT — see `LICENSE`. Copyright 2026 Darren Hall / VOLSHi. The repo
stays public through judging.
