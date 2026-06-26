# Changelog

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
