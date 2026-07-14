# Code-owned delivery

Invoke the kernel for delivery and CI observation. Do not reproduce these operations with host shell or GitHub tools.

`deliver` reads the approved immutable packet, refuses unreported dirty paths, stages the named files, commits with the reviewed message, and for `commit-push-pr` pushes and opens or reuses a PR. A hotfix still needs this final approval even when its pre-build proposal was approved.

`observe-ci` records every disposition. No registered checks is pending, not green. Failed checks create a typed evidence artifact and consume the existing repair budget; repaired work must pass deterministic checks, independent verification, and final engineer review again. Passing CI opens closeout.

When closeout writes a warranted solution document, the kernel commits and pushes that exact path and observes CI again. A failure returns to one bounded closeout repair; the run is not complete merely because the earlier implementation commit was green.
