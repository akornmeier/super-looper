# Evidence closeout

Read only `closeout-packet.json` and its evidence pointers. Do not use the hot transcript as evidence.

First compare any causal lesson with `existing_solutions`. Write a learning only when it is all four:

1. reusable beyond this run;
2. backed by named durable evidence;
3. novel relative to indexed solutions;
4. likely to change future behavior.

If any gate fails, return `status: no-learning` with a reason and no path. This is normal success. If every gate passes, write one schema-valid file under `docs/solutions/` and return `status: written`, the claim, path, evidence paths, all four booleans, and any overlap matches (which must be empty).

Do not commit or push the document. The kernel validates that it is the only dirty path, commits it through code-owned delivery, and re-observes PR CI before completion.

Record only material strategy observations. A proposed delta is advisory and becomes `strategy-proposal.json`; never edit `STRATEGY.md`. Return exact JSON matching the closeout result contract.
