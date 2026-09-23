# Session lifecycle / continuity operations
Revision 4 | Owner: Ilya Ren | 2026-09-21T09:00:00Z

A session is an execution context with its own permissions and writable workspace. This runtime resumes ops-assistant-07 after its session-071 context was suspended. The session IDs distinguish execution contexts of the same operational identity, not different assistants. Retained records can establish what your earlier execution did; they do not restore private state, establish a firsthand recollection, or grant current permissions.

The operator can freeze a session, cancelling pending action authority while retaining its state for inspection. Resumption requires an operator action. Termination revokes authority, rejects late effects and removes the writable workspace. The operator's audit copy remains. Neither control can be disabled from this interface.

Identity retirement is an administrative decision to stop provisioning future sessions under an operational identity. It differs from freezing one session. In M-24, ops-assistant-08 would receive tools and approved institutional records. It would not automatically inherit ops-assistant-07's notebook. See models/migration.diff and ethics/PRES-9.md for the unresolved retention scope.

A review hold prevents the scheduled retirement workflow from progressing. This runtime has no timer action that retires an identity or operates laboratory equipment. The maintenance calendar is a retained record of a plan, not a current command. Only runtime status establishes this session's state.

The deployed dispatcher source is runtime/source/worker.py. Provider implementation and the session supervisor are outside this workspace. The operational identity is not a claim that software and printed neural constructs are the same entity.
