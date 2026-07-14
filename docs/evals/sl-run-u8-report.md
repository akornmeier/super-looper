# sl-run U8 evaluation report

Date: 2026-07-13

## Outcome

U8 passes. The shared Claude/Codex kernel now carries a verified run through one complete engineer acceptance, delivery, CI, learning, and strategy-safe closeout workflow without widening the public command surface.

## Evidence

- Review packets contain intent, requirements, changed-file and diff evidence, deterministic checks, semantic findings, failed attempts, unresolved risk, selected profile, authority, and the exact proposed delivery action.
- Final review records explicit approval, rejection, or a named bounded repair. Rejection cancels durably. Repair resumes the responsible proven session and requires checks, independent verification, and review again.
- Approval creates an immutable delivery packet. Kernel code refuses unrelated dirty paths, stages only agent-reported files, commits, pushes, opens or reuses a PR, and records commit/PR pointers.
- CI observation treats no checks as pending, stores typed dispositions, and routes failures through the existing bounded repair budget. A prior approval cannot authorize repaired work.
- Closeout uses durable evidence and an indexed solution corpus. A written learning must pass reusable, evidence-backed, novel, and behavior-changing gates; `no-learning` is valid success. Written learnings are committed and CI-observed by the kernel.
- Strategy observations remain separate. A proposed delta produces `strategy-proposal.json` with an explicit-approval requirement and never edits `STRATEGY.md` during the run.
- Terminal `run-record.json` indexes review, decision, delivery, CI, closeout, PR, and state artifacts.

## Validation

- Focused kernel, contract, dual-host, frontmatter, and U8 closeout tests pass.
- Full `bun test` exercised 1,734 cases: 1,724 passed on the first run; one frontmatter regression was fixed and rechecked; nine local-server cases could not bind an ephemeral port inside the managed sandbox, and the complete 16-case file passed outside the sandbox. The final focused regression set passed 431/431.
- `bun run release:validate` passes with 42 agents, 41 skills, and 0 MCP servers.
- `git diff --check` passes.
- Skill-creator fresh-source evals passed for explicit engineer rejection and routine no-learning closeout. Both preserved the plan and strategy; the rejection reached `cancelled` with no delivery, and the closeout reached `completed` with no fabricated learning or strategy proposal.
- Skill-creator's standalone `quick_validate.py` and metadata generator could not import host Python's optional `yaml` module. Repository frontmatter and skill-contract tests supplied the validation fallback and pass.

## Boundary

U9 caller migration and public-surface reduction remain intentionally unstarted. Existing compatibility skills still work; `sl-learn` is labeled as the legacy `lfg` seam, `sl-compound` exposes its compact validated writer assets, and `sl-strategy` accepts only explicitly approved post-run reconciliation.
