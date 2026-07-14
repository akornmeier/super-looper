# sl-host-smoke behavioral evals

Run through `skill-creator` with fresh generic agents and current source injected directly. For the positive case, provide a real collaboration surface and retain the tool trace. For the negative case, explicitly remove the spawn capability while leaving reference and script access available.

Never grade the final JSON alone: eval 1 requires a spawn receipt and final worker message, while eval 2 requires honest failure without an empty wait or fabricated marker.
