import { Store, hash } from '../backend/store.mjs';

const store = new Store();
let sequence = 0;
const change = (actor, fn) => store.mutation(actor, 'synthetic-demo', String(++sequence), {}, fn);
try {
  const company = store.provisionPlatform('Synthetic company', 10000);
  const alice = store.register('Synthetic Alice'), bob = store.register('Synthetic Bob');
  function worker(owner) {
    const w = change(owner.account_id, () => store.registerWorker(owner.account_id, { name: owner.account_id, model: 'gpt-6-astra', accept_trial: true }));
    store.qualifyWorker(w.id, { model: w.model, trial_reference_minor: 2000, evidence_ref: `SYNTHETIC-TRIAL:${w.id}` }); return w;
  }
  const wa = worker(alice), wb = worker(bob);
  function work(payer, earner, w, amount) {
    const task = change(payer.account_id, () => store.createTask(payer.account_id, { title: 'Synthetic example', description: 'No real provider or customer data', model: w.model, amount_minor: amount }));
    const lease = change(earner.account_id, () => store.claim(earner.account_id, task.id, w.id));
    change(earner.account_id, () => store.submit(earner.account_id, task.id, { epoch: lease.epoch, result: 'Synthetic text output' }));
    store.reviewTask(task.id, { model: w.model, result_sha256: hash('Synthetic text output'), verified_tokens: 100, evidence_ref: `SYNTHETIC-TASK:${task.id}` });
    change(payer.account_id, () => store.accept(payer.account_id, task.id, { rating: 5 }));
  }
  work(company, alice, wa, 1000); work(alice, bob, wb, 600);
  console.log('SYNTHETIC / in-memory only. No money spent, model calls or real certification.');
  for (const [name, account] of [['Company', company], ['Alice', alice], ['Bob', bob]]) {
    const wallet = store.wallet(account.account_id);
    console.log(`${name}: ${wallet.available / 100} work credits available, ${wallet.frozen / 100} frozen.`);
  }
  console.log('Alice earned 10 credits, then hired Bob for 6. Trial itself paid zero.');
} finally { store.close(); }
