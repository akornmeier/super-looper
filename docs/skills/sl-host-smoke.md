# `sl-host-smoke`

> Verify that the installed super-looper package can load and complete the same bounded workflow on Claude Code or Codex.

`sl-host-smoke` is an explicit installation diagnostic. It reads one shared reference, asks one two-option question, runs one bundled script, dispatches one worker, and returns a structured pass/fail result through a host-specific runtime adapter.

It does not edit the user's repository. A pass proves the package can resolve shared skill content and the selected host adapter; it does not claim that every legacy super-looper skill is already portable.

## Use it

Invoke `/sl-host-smoke` in Claude Code or `$sl-host-smoke` in Codex after installing or updating the plugin. Choose either option when prompted. The final JSON reports the detected host and markers from the reference, script, and worker.

Use this diagnostic during plugin development or installation troubleshooting, not as part of the normal strategy, planning, or execution loop.
