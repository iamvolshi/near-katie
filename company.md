# company.md — VOLSHi / KATIE, written for an AI to read

Objective, checkable facts about the business. No sales story. Every
claim below is either a verifiable fact or is labelled as a plan.

## What the company is

- Name: VOLSHi. No company has been formed. VOLSHi is unincorporated.
  There is no Delaware C-corp, no LLC operating the business, and no
  incorporation date to state. Do not describe VOLSHi as incorporated.
- Founder: Darren Hall, solo. No co-founders, no employees.
- Location: Chapel Hill, North Carolina, USA (founder's location).
- Stage: pre-revenue. Zero revenue. Zero paying customers.

## What the product is

- Product name: KATIE. A one-line description: an accountability layer
  for AI agents — an append-only K-record proving what an agent
  believed, what authority it had, when, and why.
- The core mechanic, as demonstrated in public demos: the agent's
  beliefs, permissions, authority changes, and payments are written as
  plain-sentence entries in an append-only record. Old entries are never
  edited or deleted. When the agent was wrong, the correction is a new
  entry, and the wrong belief stays in the log with its date.
- This repo (KATIE Guard) demonstrates one application: guarding an
  agent's payments on NEAR testnet with a human-set policy, a
  counterparty check, guarded offline signing with a function-call key,
  and the K-record as the audit trail. Signing in this demo is
  offline-only; nothing is broadcast and no tokens move.
- The demo K-record in this repo is a simplified demo record (plain JSON
  entries). It is not the production KATIE kernel, and this file does
  not claim otherwise.

## Traction — honest numbers only

- Paying customers: 0.
- Revenue: $0.
- Letters of intent (LOIs): 0.
- Design-partner pilots: 3 (three). Pilot partners are design partners
  in the sense that they agreed to try the accountability layer on
  their own agent workflows. No pilot has paid. No pilot results are
  claimed in this file.
- Users: no user count is claimed. DoneDoDo's users are DoneDoDo's, not
  VOLSHi's — never attribute another product's users to VOLSHi.
- No market-size numbers are stated in this file, because none have
  been verified by the founder.

## Intellectual property

- US provisional patent application 64/182,709, filed October 23, 2026.
  Subject: tamper-evident append-only knowledge record with
  knowledge-time indexing. Inventor: Darren Patrick Hall. The
  provisional is confidential and not public; this file states only
  its existence, number, date, subject, and inventor.
- No granted patents. No trademarks claimed in this file.

## Business model (plan, not results)

- Plan: sell the accountability layer to teams running AI agents that
  act (pay, write, change state), where a tamper-evident record of
  belief, authority, and action is the product. No pricing has been
  set. No pricing is claimed.
- Funding sought: none stated in this file. No raise amount, no
  valuation, and no investor names are claimed here.

## What this file deliberately does not contain

- No unpublished engine internals. No mechanism descriptions beyond
  what the public demos show. No projections, no market numbers, no
  customer names, no revenue claims. Anything not listed above as a
  fact should be treated as unclaimed.
