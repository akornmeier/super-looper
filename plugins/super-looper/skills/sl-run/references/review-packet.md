# Engineer review packet

Use `review-packet.json` as the acceptance surface. It contains intent and requirements, agent-reported changed files, diff summary, deterministic and semantic evidence, failed attempts, unresolved risks, route/profile rationale, current authority, and the exact proposed delivery action.

Ask for one explicit decision:

- `approved`: authorize only the proposed delivery packet.
- `rejected`: cancel the run with the engineer's rationale.
- `repair-requested`: name one plan unit and give a bounded repair rationale.

Do not translate silence, prior hotfix proposal approval, passing checks, or `review_ready` into delivery authority. Unattended mode stops without recording a decision.
