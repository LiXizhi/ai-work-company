import { readFileSync } from 'node:fs';
import { Store } from './store.mjs';

process.umask(0o077);
const [command, target, argument, extra] = process.argv.slice(2);
const usage = `Local operator commands (same AWC_DB as the server):
  provision-platform <name> <seed-budget-minor>
  qualify-worker <worker-id> <reviewed-evidence.json>
  review-task <task-id> <reviewed-evidence.json>
  suspend-worker <worker-id>
  refund-task <task-id> <decision-reference>
  set-owner-limits <account-id> <daily-limit-minor> <concurrency>
Evidence must be independently reviewed before these commands. They do not
authenticate a provider receipt. Never feed an untrusted Worker file directly
to the operator commands. See docs/implementation.md.`;
if (!command || command === '--help') { console.log(usage); process.exit(0); }
const store = new Store(process.env.AWC_DB || 'data/company.sqlite');
try {
  let value;
  if (command === 'provision-platform') value = store.provisionPlatform(target, Number(argument));
  else if (command === 'qualify-worker') value = store.qualifyWorker(target, JSON.parse(readFileSync(argument, 'utf8')));
  else if (command === 'review-task') value = store.reviewTask(target, JSON.parse(readFileSync(argument, 'utf8')));
  else if (command === 'suspend-worker') value = store.suspend(target);
  else if (command === 'refund-task') value = store.resolveDispute(target, 'refund', argument);
  else if (command === 'set-owner-limits') value = store.limits(target, Number(argument), Number(extra));
  else throw new Error(usage);
  console.log(JSON.stringify(value, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { store.close(); }
