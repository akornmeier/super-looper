# Isolation and bounded team policy

The kernel records capabilities; the host adapter never claims isolation it does not provide.

| Mode | Meaning | Parallel eligibility |
|---|---|---|
| `sandbox` | Each worker has a dedicated host sandbox/computer with an explicit integration path | Eligible |
| `worktree` | Each worker has a dedicated Git worktree and branch | Eligible |
| `shared` | Workers use the same checkout | Never eligible; serialize |

The kernel selects `sandbox`, then `worktree`, then `shared` from capabilities supplied at initialization. One worker remains the default. An explicit `max-workers:2` or `max-workers:3` can only raise the recorded execution limit when the selected isolation mode is eligible and a phase contains DAG-independent units with mechanically non-overlapping owned scopes. The hard cap is three and the selected profile may lower it.

U7 records eligible groups and the enforced limit but the portable coordinator still dispatches one unit per `start-next` action. A host must not infer that eligibility itself authorizes simultaneous shared-checkout work. Actual parallel dispatch requires an adapter that preserves one-writer state integration and the recorded isolation contract.
