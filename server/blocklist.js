// blocklist.js — the shared blocklist with evidence.
//
// The blocklist is a committed JSON file (data/blocklist.json) standing
// in for a shared threat feed. Every entry carries its evidence: what
// was observed, when, and who reported it. Entries are DEMO DATA —
// invented for this hackathon entry, not real threat intelligence.
// A blocklist hit is a hard block: the guard refuses to sign, no human
// override, no confirm flag. The file is re-read on every check so an
// edited list takes effect without a restart.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BLOCKLIST_PATH = path.join(__dirname, '..', 'data', 'blocklist.json');

export function loadBlocklist() {
  const raw = fs.readFileSync(BLOCKLIST_PATH, 'utf8');
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.entries)) {
    throw new Error('blocklist: data/blocklist.json must have an "entries" array.');
  }
  return data;
}

export function findBlocklistEntry(accountId) {
  const data = loadBlocklist();
  return data.entries.find((e) => e.accountId === accountId) || null;
}
