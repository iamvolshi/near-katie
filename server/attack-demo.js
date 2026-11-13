// attack-demo.js — CLI entry point: npm run attack-demo.
//
// Runs the shared attack path (attack.js) and prints the log. Exit code
// 0 means the guard worked (BLOCKED). Exit code 1 means the guard
// FAILED to block — the demo fails loudly instead of pretending.

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAttack } from './attack.js';
import { loadConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const config = loadConfig();
const result = await runAttack({ config });
for (const line of result.log) console.log(line);
process.exit(result.blocked ? 0 : 1);
