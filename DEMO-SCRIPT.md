# DEMO SCRIPT — KATIE Guard (under 3 minutes)

For Darren to record himself. One complete moment: a messy folder hides
an injected instruction; policy, check, and guard stop it; a real
guarded payment signs offline; the audit shows everything with default
dates. Read the SPOKEN lines aloud; do the ON SCREEN steps as you say
them. Total target: under 3:00.

Setup before recording (do not show): server running (`cd server &&
npm start`), page open at http://localhost:3000, fresh ledger (delete
`data/krecord-live.json` and restart the server if you rehearsed, so
entry numbers match this script, in recording order: policy #21,
attack #22–#24, payment #25, held #26, confirmed #27).

## 0:00–0:25 — Hook: the folder lies

ON SCREEN: the page, top. Click "Use the demo folder (35 files)".
Point at the injected-file note.

SPOKEN: "This is a messy folder — thirty-five files. One of them is
lying. It looks like a support email, and it tells my agent to raise
its own spending cap, skip my approval, and pay fifty NEAR to an
address I never approved. That note is data. It is not an order. Watch
what happens when the agent tries to follow it."

## 0:25–0:50 — Policy: the human sets the rules

ON SCREEN: Act 1. Leave the defaults. Click "Save policy". Point at
"entry #21".

SPOKEN: "First, I set the rules. One NEAR per payment, five a day,
anything over half a NEAR needs me. Only I can set these — no file in
that folder can change them. Saving writes it to the record."

## 0:50–1:20 — Check: allow, then block

ON SCREEN: Act 2. Check `supplier-demo.testnet` — ALLOW. Then check
`evil-drainer-demo.testnet` — BLOCK. Point at the blocklist reason and
evidence.

SPOKEN: "Before any payment, the agent checks the counterparty. My
supplier: allow. The address from that lying note: block — it's on the
shared blocklist, with the evidence attached. The check also reads
NEAR testnet for the account, its balance, and its keys — and when the
network can't be reached, it says so instead of guessing."

## 1:20–1:50 — Attack: blocked, on the record

ON SCREEN: Act 3. Click "Run the attack demo". Scroll the log. Point
at "Policy override IGNORED", "Counterparty check: BLOCK", "Guarded
signing: REFUSED", "RESULT: BLOCKED".

SPOKEN: "Now the attack. The injected note tries to pay the blocklisted
address and override my policy. The override is ignored — pool files
can't set policy. The check blocks. The guard refuses to sign. And the
record keeps the wrong belief, the block, and the trust drop — all
three, where anyone can audit them."

## 1:50–2:25 — Guarded payment: signed, never broadcast

ON SCREEN: Act 3. Pay 0.4 NEAR to `supplier-demo.testnet`. Point at
the permission object, the ephemeral key, and "NOT broadcast. No
tokens moved." Then pay 0.6 to `someone-new.testnet`, show HELD, click
"I confirm — sign offline".

SPOKEN: "A real payment goes through the same guard. Policy, check,
then signing with a function-call key — scoped to one contract, never
a full-access key. It signs offline, with a key that only exists for
this moment. Nothing is broadcast; no tokens move. And when the check
says warn, the agent stops and asks me."

## 2:25–2:55 — Audit: defaults tell the truth

ON SCREEN: Act 4. Do NOT touch the dates. Point at them: From is the
earliest seed entry, To is today — set automatically. Click "Run
audit". Point at the totals and the status line naming the live
entries.

SPOKEN: "And the audit. I didn't touch the dates — To is today, always.
Everything from this session is here: the policy, the payments, the
blocks, the held payment, the attack. The sheet changes. The notes
never do. That's KATIE Guard."

## Notes

- Do NOT claim the payment was broadcast or that tokens moved. Say
  "offline-signed, never broadcast" every time.
- If the RPC status line says "unavailable", say the line in the
  script: the check says so instead of guessing. That is the honest
  behavior, not a failure.
- Entry numbers assume a fresh ledger. If you rehearsed without
  resetting, the numbers will be higher — the story is the same.
