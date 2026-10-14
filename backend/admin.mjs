import { readFileSync } from 'node:fs';
import { Store } from './store.mjs';

process.umask(0o077);
const [command, target, argument, extra] = process.argv.slice(2);
const usage = `Local operator commands (same AWC_DB as the server):
  configure-model <price.json>
  disable-model <model-id>
  models
  trial-reviews
  trial-status <worker-id>
  disable-trial <template-id>
  add-trial <task-template.json>
  review-trial <trial-id> <reviewed-evidence.json>
  graduate-worker <worker-id> <decision-reference>
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
  if (command === 'configure-model') value = store.trials.configure(JSON.parse(readFileSync(target, 'utf8')));
  else if (command === 'disable-model') value = store.trials.disable(target);
  else if (command === 'models') value = store.trials.catalog();
  else if (command === 'trial-reviews') value = store.all("SELECT * FROM trial_runs WHERE state IN ('submitted','expired','revoked') ORDER BY created_at LIMIT 100");
  else if (command === 'trial-status') { const w = store.one('SELECT * FROM workers WHERE id=?', target); if(!w) throw new Error('worker_not_found'); value = store.trials.progress(w.owner, target); }
  else if (command === 'disable-trial') { store.run('UPDATE trial_templates SET enabled=0 WHERE id=?', target); value = {id:target,enabled:false}; }
  else if (command === 'add-trial') value = store.trials.template(JSON.parse(readFileSync(target, 'utf8')));
  else if (command === 'review-trial') value = store.trials.review(target, JSON.parse(readFileSync(argument, 'utf8')));
  else if (command === 'graduate-worker') value = store.trials.graduate(target, argument);
  else if (command === 'provision-platform') value = store.provisionPlatform(target, Number(argument));
  else if (command === 'qualify-worker') value = store.qualifyWorker(target, JSON.parse(readFileSync(argument, 'utf8')));
  else if (command === 'review-task') value = store.reviewTask(target, JSON.parse(readFileSync(argument, 'utf8')));
  else if (command === 'suspend-worker') value = store.suspend(target);
  else if (command === 'refund-task') value = store.resolveDispute(target, 'refund', argument);
  else if (command === 'set-owner-limits') value = store.limits(target, Number(argument), Number(extra));
  else throw new Error(usage);
  console.log(JSON.stringify(value, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { store.close(); }
