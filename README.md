<p align="center">
  <img src="super-looper-logo.png" alt="Super Looper" width="200" />
</p>

# Super Looper

[![Build Status](https://github.com/akornmeier/super-looper/actions/workflows/ci.yml/badge.svg)](https://github.com/akornmeier/super-looper/actions/workflows/ci.yml)

AI skills and agents that make each unit of engineering work easier than the last.

## Philosophy

**Each unit of engineering work should make subsequent units easier -- not harder.**

Traditional development accumulates technical debt. Every feature adds complexity. Every bug fix leaves behind a little more local knowledge that someone has to rediscover later. The codebase gets larger, the context gets harder to hold, and the next change becomes slower.

Super looper inverts this. 80% is in planning and review, 20% is in execution:

- Plan thoroughly before writing code with `/sl-brainstorm` and `/sl-plan`
- Review to catch issues and calibrate judgment with `/sl-code-review` and `/sl-doc-review`
- Codify knowledge so it is reusable with `/sl-compound`
- Keep quality high so future changes are easy

The point is not ceremony. The point is leverage. A good brainstorm makes the plan sharper. A good plan makes execution smaller. A good review catches the pattern, not just the bug. A good compound note means the next agent does not have to learn the same lesson from scratch.

And the same loop runs hands-off. `/lfg` fires the whole pipeline -- plan, work, review, commit, open a PR, then watch CI and fix failures until it is green -- and iterates unattended. That is the looper in super looper: not just compounding leverage, but a loop you can let run to green on its own.

**Learn more**

- [Full component reference](plugins/super-looper/README.md) - all agents and skills

## Workflow

`/sl-strategy` is upstream of the loop -- it captures the product's target problem, approach, persona, metrics, and tracks as a short durable anchor at `STRATEGY.md`. Ideate, brainstorm, and plan read it as grounding when present, so strategy choices flow into feature conception, prioritization, and spec.

The core loop is: brainstorm the requirements, plan the implementation, work through the plan, review the result, compound the learning, then repeat with better context.

Use `/sl-ideate` before the loop when you want the agent to generate and critique bigger ideas before choosing one to brainstorm. It produces a ranked ideation artifact, not requirements, plans, or code.

| Skill               | Purpose                                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/sl-strategy`      | Create or maintain `STRATEGY.md` -- the product's target problem, approach, persona, key metrics, and tracks. Read as grounding by ideate, brainstorm, and plan |
| `/sl-ideate`        | Optional big-picture ideation: generate and critically evaluate grounded ideas, then route the strongest one into brainstorming                                 |
| `/sl-brainstorm`    | Interactive Q&A to think through a feature or problem and write a right-sized requirements doc before planning                                                  |
| `/sl-plan`          | Turn feature ideas into detailed implementation plans                                                                                                           |
| `/sl-work`          | Execute plans with worktrees and task tracking                                                                                                                  |
| `/sl-debug`         | Systematically reproduce failures, trace root cause, and implement fixes                                                                                        |
| `/sl-code-review`   | Multi-agent code review before merging                                                                                                                          |
| `/sl-compound`      | Document learnings to make future work easier                                                                                                                   |
| `/sl-product-pulse` | Generate a single-page, time-windowed pulse report on usage, performance, errors, and followups. Saves to `docs/pulse-reports/`                                 |

`/sl-product-pulse` is the read-side companion -- a time-windowed report on what users actually experienced and how the product performed over a given window (24h, 7d, etc.), saved to `docs/pulse-reports/` so past pulses form a browseable timeline of user outcomes. The next strategy update and the next brainstorm get real signal to anchor to.

Each cycle compounds: brainstorms sharpen plans, plans inform future plans, reviews catch more issues, patterns get documented.

### Run it autonomously

`/lfg "<feature description>"` runs the entire loop end-to-end without stopping. It plans, works through the plan, reviews and applies fixes, commits, pushes, opens a PR, then watches CI and repairs failures until the build is green. Reach for it when the task is clear and self-contained and you want hands-off execution; reach for the individual skills above when you want to steer each stage yourself.

## Quick Example

For hands-off execution, one command runs the whole loop to green:

```text
/lfg "make background job retries safer"
```

To steer each stage yourself, run the loop step by step -- turn a rough idea into a requirements doc, then plan from that doc before handing execution to `/sl-work`:

```text
/sl-brainstorm "make background job retries safer"
/sl-plan docs/brainstorms/background-job-retry-safety-requirements.md
/sl-work
/sl-code-review
/sl-compound
```

For a focused bug investigation:

```text
/sl-debug "the checkout webhook sometimes creates duplicate invoices"
/sl-code-review
/sl-compound
```

## Getting Started

After installing, run `/sl-setup` in any project. It checks your environment, installs missing tools, and bootstraps project config.

The `super-looper` plugin currently ships 38 skills and 43 agents. See the [full component reference](plugins/super-looper/README.md) for the complete inventory.

## Install

In Claude Code:

```text
/plugin marketplace add akornmeier/super-looper
/plugin install super-looper
```

## Local Development

```bash
bun install
bun test
bun run release:validate
```

For active development against your local checkout, add a shell alias so your local copy loads alongside your normal plugins:

```bash
alias cce='claude --plugin-dir ~/Code/super-looper-plugin/plugins/super-looper'
```

Run `cce` instead of `claude` to test your changes. Your production install stays untouched.

To test a branch from a worktree without switching checkouts, point `--plugin-dir` directly at the worktree path:

```bash
claude --plugin-dir /path/to/worktree/plugins/super-looper
```

## Limitations

Release versions are owned by release automation. Routine feature PRs should not hand-bump plugin or marketplace manifest versions.

## FAQ

### Where do I see all available skills and agents?

Read the [Super Looper plugin README](plugins/super-looper/README.md). It lists the current skill and agent inventory.

### Where is release history?

GitHub Releases are the canonical release-notes surface. The root [`CHANGELOG.md`](CHANGELOG.md) points to that history.

## Contributing

Contributions are welcome. Issues, bug reports, and pull requests all help make this better, and we genuinely appreciate them — bug reports especially.

A note on what to expect: Super Looper is opinionated by design. It's maintained by [@akornmeier](https://github.com/akornmeier), and its direction reflects a specific point of view about how AI-assisted engineering should work. So while we welcome help, we can't promise to accept every change — some proposals won't fit that vision even when they're good ideas on their own.

Open an issue or send a PR, and we'll fold in what moves the plugin in the right direction. We just want to be upfront that not everything will land.

## License

[MIT](LICENSE)
