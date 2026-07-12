# Changelog

## [0.6.1](https://github.com/akornmeier/super-looper/compare/super-looper-v0.6.0...super-looper-v0.6.1) (2026-07-12)


### Bug Fixes

* **resolve-pr-feedback:** auto-refresh a bot-blocked review gate after quiescence ([3b286ba](https://github.com/akornmeier/super-looper/commit/3b286baa3cbfbdb0b008cc05f0c1f0d89ee879fd))
* **resolve-pr-feedback:** auto-refresh a bot-blocked review gate after quiescence ([cc97744](https://github.com/akornmeier/super-looper/commit/cc97744c1aea163a15e2cbc2cb3a2ea5bafaa8ad))

## [0.6.0](https://github.com/akornmeier/super-looper/compare/super-looper-v0.5.0...super-looper-v0.6.0) (2026-07-11)


### Features

* **sl-plan:** add bundled image generation script with script-side base64 injection ([8d8e623](https://github.com/akornmeier/super-looper/commit/8d8e623f105133810ab8204c6b214de8adf75101))
* **sl-plan:** add canonical HTML plan template adapted from planf3 ([3a11aae](https://github.com/akornmeier/super-looper/commit/3a11aaed306426d2ac02298545cd9215acbf6d76))
* **sl-plan:** declare HTML plans stateful tracked artifacts in section contract ([198116a](https://github.com/akornmeier/super-looper/commit/198116aadb60a7220186b85a1a54a7cc6d4388f0))
* **sl-plan:** planf3-style HTML plans with images and live tracking ([dd193e8](https://github.com/akornmeier/super-looper/commit/dd193e8e71dd7b28b00d731744c0b16b35cb10e0))
* **sl-plan:** stamp HTML plans from canonical template and fill image slots post-write ([b4efb65](https://github.com/akornmeier/super-looper/commit/b4efb65aea52969b1d0d920752d3d6ba72430988))
* **sl-work:** maintain advisory status markers in HTML plans during interactive execution ([1a91d74](https://github.com/akornmeier/super-looper/commit/1a91d749724884598ff4061ff153015ac82b3741))


### Bug Fixes

* **sl-plan:** harden image-slot grammar, script failure paths, and fill-later routing per review ([3649eff](https://github.com/akornmeier/super-looper/commit/3649eff0b37faa8a280b66c3bffd6b13618853a0))
* **sl-work:** release finished subagents so they mark complete in the UI ([fd9b4de](https://github.com/akornmeier/super-looper/commit/fd9b4de098b5390015d5146cb53c063a38d4be56))
* **sl-work:** scope ship-time metadata ownership and own global validation markers ([baec94f](https://github.com/akornmeier/super-looper/commit/baec94f44ae54d2e996a1d0d71927b1d0bae2ae6))

## [0.5.0](https://github.com/akornmeier/super-looper/compare/super-looper-v0.4.1...super-looper-v0.5.0) (2026-07-05)


### Features

* **evals:** behavioral eval suites for the four load-bearing skills ([61393d7](https://github.com/akornmeier/super-looper/commit/61393d7968bcff4d8f98252dd785673b529115a5))
* goal guard, loop resume, learning gate, hygiene, and evals ([2bcd93d](https://github.com/akornmeier/super-looper/commit/2bcd93d327037772b1c75073732b7269b907851d))
* **hooks:** plugin goal-guard hook — deny goal-file writes in unattended runs ([7f03775](https://github.com/akornmeier/super-looper/commit/7f037758e79154dfae4261865425f5c30721102b))
* **learn:** evaluator gate separates generator from evaluator on the learning path ([2b643f2](https://github.com/akornmeier/super-looper/commit/2b643f2705494f2bc834f762eab075f0ddb8d9fa))
* **learn:** refresh-due threshold signal and corpus staleness pass ([dc45641](https://github.com/akornmeier/super-looper/commit/dc45641844b8b86ad1835517980ba102a9a917a0))
* **lfg:** run-progress file written at every step boundary ([29d7da2](https://github.com/akornmeier/super-looper/commit/29d7da2013e82ae6de057996caf371e4bf8e09ee))
* **lfg:** write the goal-change protocol as a grep-tested contract ([0897804](https://github.com/akornmeier/super-looper/commit/0897804f58e9bc4a654bc690a335f5667f5367b6))
* **loop:** instrument goal_fidelity from review verdict to run-record ledger ([6ae382b](https://github.com/akornmeier/super-looper/commit/6ae382b6237647223e41cf6fd258be50c028cb29))
* **loop:** resume retries from the recorded step instead of cold-restarting ([5d2038f](https://github.com/akornmeier/super-looper/commit/5d2038f59a1cbdf8a1cee85e514d48321aa35a28))
* **solutions:** add confidence, provenance, and evidence trust fields ([665300c](https://github.com/akornmeier/super-looper/commit/665300ccef35ccaaaac6cfb5951f60964ef62c93))


### Bug Fixes

* **agents:** retire two unwired agents and enforce fleet color conventions ([feb08d3](https://github.com/akornmeier/super-looper/commit/feb08d3142f272de56f84559c18649bf5ef6b8e3))
* **docs:** generate docs/skills index from frontmatter with integrity tests ([ba112b7](https://github.com/akornmeier/super-looper/commit/ba112b71d5815209cbae9e4776089f01ada01a06))
* **release:** clean stale packaging artifacts and close version-drift validator gap ([ab9795f](https://github.com/akornmeier/super-looper/commit/ab9795f2eec2ba2602c0a428bfca989a56e8beef))
* **review:** apply review findings ([61ce166](https://github.com/akornmeier/super-looper/commit/61ce16649fb7c672a6e15ef6e3408f47d454e06a))

## [0.4.1](https://github.com/akornmeier/super-looper/compare/super-looper-v0.4.0...super-looper-v0.4.1) (2026-06-26)


### Bug Fixes

* **agents:** assign role-based colors to all 43 agents ([c43ffc1](https://github.com/akornmeier/super-looper/commit/c43ffc17957501ddd5386e63b195ab1a40f3d40d))
* **agents:** role-based, fleet-scoped color scheme for all 43 agents ([a031cfc](https://github.com/akornmeier/super-looper/commit/a031cfccb79a923e671c533281089bcc769f1d13))

## [0.4.0](https://github.com/akornmeier/super-looper/compare/super-looper-v0.3.0...super-looper-v0.4.0) (2026-06-21)


### Features

* **pulse:** wire unattended completion rate to a run-record ledger ([db4dd7d](https://github.com/akornmeier/super-looper/commit/db4dd7da34252b334bed7db11991ac20ba5f9edd))
* **sl-product-pulse:** add local JSONL ledger source kind (U3) ([23cd9d5](https://github.com/akornmeier/super-looper/commit/23cd9d5c87276d7747270514cc9db85b82bf343a))
* **sl-product-pulse:** render learning_reuse as labeled git citation proxy (U5) ([61eaf1b](https://github.com/akornmeier/super-looper/commit/61eaf1b497e62b9f9ea5cf101e05af19997a9d9f))


### Bug Fixes

* **loop:** run ledger append on failed loops and guard ledger integrity ([f261e38](https://github.com/akornmeier/super-looper/commit/f261e38cb1df1d9d20bf90473f042a25c867f898))

## [0.3.0](https://github.com/akornmeier/super-looper/compare/super-looper-v0.2.0...super-looper-v0.3.0) (2026-06-20)


### Features

* capture learnings at the autopilot's ship-time seam ([8cc067f](https://github.com/akornmeier/super-looper/commit/8cc067f0098068a5006a7f4ce386f0cac6901e53))
* clean plan-to-work handoff for the implementation autopilot ([3460218](https://github.com/akornmeier/super-looper/commit/3460218a19b80b1620f9f7f8ccb741822d9f5e79))
* **lfg:** add debug-escalation rung to the CI-fix loop ([8746b77](https://github.com/akornmeier/super-looper/commit/8746b772cb77e44f3d134eb4548ca86838fd70a9))
* **lfg:** add debug-escalation rung to the CI-fix loop ([3e4ef45](https://github.com/akornmeier/super-looper/commit/3e4ef45fd6a41e144ddf29dfa1f13270cdb2420e))
* **lfg:** trigger the sl-learn seam after CI green, before DONE ([29e4ba7](https://github.com/akornmeier/super-looper/commit/29e4ba76ca73581f42065598146b1ca4cce0403c))
* **sl-learn:** add ship-time learning-capture seam ([1b15a81](https://github.com/akornmeier/super-looper/commit/1b15a81acde68e0770a27cebd7a8ad5db83f3ef9))
* **sl-plan:** offer the work loop at the end-of-plan seam ([855ecb4](https://github.com/akornmeier/super-looper/commit/855ecb48aeec417a4fda0665100024409c64fbe6))


### Bug Fixes

* **lfg:** accept HTML plan shape at the plan-input gate ([#11](https://github.com/akornmeier/super-looper/issues/11)) ([0e3b035](https://github.com/akornmeier/super-looper/commit/0e3b0359f175fe38e2724bb4a6878209a3b44c68))
* **README:** restore sl-handoff docs link ([#12](https://github.com/akornmeier/super-looper/issues/12)) ([af3c754](https://github.com/akornmeier/super-looper/commit/af3c75477ccb5cae40faa66cb1cd9a0fc1190b84))
* **resolve-pr-feedback:** add wait-for-bot-review poll script ([30f4f1c](https://github.com/akornmeier/super-looper/commit/30f4f1c4d8acc0df2b82bff8dd1b33472a3da418))
* **resolve-pr-feedback:** harden quiescence gate against gh failure modes ([fefb41f](https://github.com/akornmeier/super-looper/commit/fefb41f9c640542ed20ba1ef16966463e1c7883f))
* **resolve-pr-feedback:** make reply-to-pr-thread example a single pinned command ([dafb4ed](https://github.com/akornmeier/super-looper/commit/dafb4ed64f380b1e7b2f35b1d84612a739b3a6b1))
* **resolve-pr-feedback:** surface wait-for-bot-review and scope it out of targeted mode ([614daa1](https://github.com/akornmeier/super-looper/commit/614daa1476218f013377ac2188b42a26389c2404))
* **resolve-pr-feedback:** wait for async bot re-review before concluding verify loop ([02db673](https://github.com/akornmeier/super-looper/commit/02db673da3e17d9b8825b5e9b83a7f44783faa95))
* **resolve-pr-feedback:** wait for bot re-review before concluding verify loop ([d96850f](https://github.com/akornmeier/super-looper/commit/d96850fbfc890a6f0bb3d6a44da9b35fc465fe13))
* **review:** disambiguate plan: marker from handoff context, correct plan-input docs, add coverage ([7051dcd](https://github.com/akornmeier/super-looper/commit/7051dcd4c9dabd43f42f2fc8d40da3a9ec338997))

## [0.2.0](https://github.com/akornmeier/super-looper/compare/super-looper-v0.1.0...super-looper-v0.2.0) (2026-06-17)


### Features

* **solutions:** single-source schema for docs/solutions frontmatter ([9029e76](https://github.com/akornmeier/super-looper/commit/9029e7679d2b177effedfe27044fb7945e9a2c89))


### Bug Fixes

* **solutions:** address PR review feedback ([#2](https://github.com/akornmeier/super-looper/issues/2)) ([c9c7e8b](https://github.com/akornmeier/super-looper/commit/c9c7e8baee59c22abb2ebb3296b8394ec5950b89))
* **solutions:** regenerate schema docs from web-stack enums and lock with drift gate ([0035a8c](https://github.com/akornmeier/super-looper/commit/0035a8c727b4c3e689ebb43acd2421c13b1db192))

## Changelog

Release notes for the `super-looper` plugin live in
[GitHub Releases](https://github.com/akornmeier/super-looper/releases).

This file is intentionally a pointer. Release automation publishes notes to the
GitHub Releases surface; it does not maintain a changelog body here.
