# Example loop seed — `isPalindrome`

A deliberately tight seed for the unattended loop driver. It is fully specified —
exact file paths, the function signature, and named input/expected-output pairs —
so `sl-plan` has no domain ambiguity and no unresolved product question to ask.
An underspecified seed would stall the unattended run on a clarifying-question
branch until the wall-clock cap; this one fails fast or finishes fast instead.

It is sized to plan → implement → verify in a single run.

## Task

Add a function `isPalindrome(s: string): boolean` to a throwaway Bun + TypeScript
repository.

- Create `src/palindrome.ts` exporting `isPalindrome`. It returns `true` when `s`
  reads the same forward and backward after lowercasing and removing every
  character that is not `[a-z0-9]`.
- Create `src/palindrome.test.ts` (Bun test) covering exactly these cases:
  - `""` → `true`
  - `"A man, a plan, a canal: Panama"` → `true`
  - `"racecar"` → `true`
  - `"hello"` → `false`
  - `"ab"` → `false`
- Do not add dependencies, config, or any file beyond the two above.

## Verification

`bun test` passes. This is both the throwaway repo's CI command (see
`examples/throwaway-ci.yml`) and the local `--verify-cmd` proxy.
