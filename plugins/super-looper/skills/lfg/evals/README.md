# lfg compatibility evals

Use the `skill-creator` fresh-source workflow. Inject the current `lfg/SKILL.md` and only the reference needed by the case; do not invoke the session-cached plugin skill.

The suite checks four load-bearing routes: description -> plan -> unattended run, direct plan forwarding, durable state resume, and explicit-only legacy access. It deliberately delegates kernel behavior coverage to the `sl-run` eval suite.
