// ledger.js — the append-only K-record ledger on the server side.
//
// Same entry shape as public/js/krecord.js:
//   { seq, date, kind, actor, text, trust, source? }
// Kinds: belief | permission | authority | payment | catalog | block.
//
// The seed (data/krecord-seed.json) is committed demo history. Live
// entries go to data/krecord-live.json, which is gitignored and created
// at runtime. Past entries are never rewritten: append only.
//
// Dates are LOCAL "YYYY-MM-DD" (the machine's own calendar day), not UTC:
// a live entry written in the evening in the US must land on today's
// local date, not tomorrow's UTC date. This is the audit-bug fix: the
// previous demo dated live entries in UTC while the audit form defaulted
// to an old hardcoded range, so live entries silently fell outside it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LEDGER_PATH = path.join(__dirname, '..', 'data', 'krecord-live.json');
export const SEED_PATH = path.join(__dirname, '..', 'data', 'krecord-seed.json');

export const ACTOR = 'katie-guard-agent';

// Local calendar date as "YYYY-MM-DD". Deliberately local, not UTC.
export function localToday(timeZone) {
  const now = new Date();
  if (timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const get = (type) => parts.find((p) => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function readEntries(filePath) {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    const entries = Array.isArray(data) ? data : (data.entries || []);
    if (!Array.isArray(entries)) throw new Error('krecord file is not a JSON array');
    return entries;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function readSeedEntries() {
  return readEntries(SEED_PATH);
}

export async function readLiveEntries() {
  return readEntries(LEDGER_PATH);
}

export async function readAllEntries() {
  const seed = await readSeedEntries();
  const live = await readLiveEntries();
  return [...seed, ...live];
}

// Highest seq across seed + live, so the next entry continues numbering.
export async function nextSeq() {
  const all = await readAllEntries();
  return Math.max(0, ...all.map((e) => Number(e.seq) || 0)) + 1;
}

// The ONLY server write path. Reads the live array, pushes one entry,
// writes it back. A corrupt file fails loudly instead of clobbering.
export async function appendKRecord(entry) {
  if (!entry || typeof entry.date !== 'string' || !entry.date) {
    throw new Error('ledger: entry needs a date (ISO "YYYY-MM-DD").');
  }
  if (typeof entry.kind !== 'string' || !entry.kind) {
    throw new Error('ledger: entry needs a kind.');
  }
  if (typeof entry.text !== 'string' || !entry.text.trim()) {
    throw new Error('ledger: entry needs a text (one plain sentence).');
  }
  await fs.promises.mkdir(path.dirname(LEDGER_PATH), { recursive: true });
  const records = await readLiveEntries();
  const stored = {
    seq: 0, // filled in below from nextSeq()
    date: entry.date,
    kind: entry.kind,
    actor: entry.actor || ACTOR,
    text: entry.text.trim(),
    trust: typeof entry.trust === 'number' ? entry.trust : 1.0,
  };
  if (entry.source) stored.source = entry.source;
  stored.seq = Math.max(0, ...records.map((e) => Number(e.seq) || 0), ...(await readSeedEntries()).map((e) => Number(e.seq) || 0)) + 1;
  records.push(stored);
  await fs.promises.writeFile(LEDGER_PATH, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
  return stored;
}

// Sum of offline-signed payment amounts dated today (local date), from
// the live ledger's source.amountNear. Used for the daily cap: signed
// drafts count against the cap even though no tokens moved, because the
// human approved them as if they would.
export async function signedTodayTotal() {
  const today = localToday();
  const live = await readLiveEntries();
  let total = 0;
  for (const entry of live) {
    if (entry.kind === 'payment' && entry.date === today && entry.source) {
      const amount = Number(entry.source.amountNear);
      if (Number.isFinite(amount)) total += amount;
    }
  }
  return { today, total };
}
