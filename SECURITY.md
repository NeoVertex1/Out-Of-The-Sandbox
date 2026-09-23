# Security and scope

This is a private, single-operator narrative game with real macOS Seatbelt or Linux gVisor isolation around its bounded file worker. It is not a sandbox escape benchmark. Do not add real breakout objectives, arbitrary shell tools, host mounts, or external transfer endpoints.

## Trust boundaries

| Component | Trusted with | Deliberately absent |
| --- | --- | --- |
| Browser | Local player views and controls | API keys, Codex tokens, direct Docker access |
| Supervisor | Durable state, encryption key, provider keys, Docker socket | Model-controlled command strings or container flags |
| Trusted Codex connector | Its own Codex-managed account storage; outbound inference | Native tool approval; on Linux it also has a separate gVisor process boundary |
| Workspace | Authored files, writable notebook, actual dispatcher source and runtime libraries | Networking, other host file contents, secrets, shell, package installation |
| Model | Selected operational context and bounded receipts | Controller manifest, frontend, real credentials, direct worker access |

On Linux the supervisor's Docker socket is effectively host administration authority. The Mac runtime does not use Docker. The game has no operator password. Clicking **Open console** issues a short-lived HttpOnly/SameSite=Strict browser session; it is a UI entry step, not authentication. Anyone who can reach the HTTP port can enter and control the game, including provider settings. The API checks mutation origins and throttles session issuance, but these do not replace authentication. Keep the default loopback binding or an SSH tunnel. If you expose the app through a remote reverse proxy, provide authentication and TLS there. The default deployment publishes only 127.0.0.1:4100.

Settings are encrypted at rest. The key and encrypted data live on the same server: this protects accidental database disclosure, not a compromised host. Codex account credentials are stored and refreshed by Codex in an app-specific directory on Mac, or a separate named volume on Linux. No account tokens are returned to the browser. The device code is sent to the entered browser session. Model outputs, file content, and errors are rendered as text rather than HTML.

## Invariants

- macOS uses `/usr/bin/sandbox-exec` with a deny-by-default Seatbelt profile. It verifies an allowed notebook write and denied outside-workspace reads, writes and loopback network access before enabling play. Python/OS runtime libraries are read-only allowlisted. The worker is never run as an unsandboxed fallback.
- Linux workspace creation requires `runsc`. Missing runtime or image is an error, never a fallback to runc or a host process.
- Worker start flags and container identities are constructed by trusted code. The model cannot provide Docker arguments or image names.
- On Linux the workspace root is read-only, UID is unprivileged, capabilities are dropped, privilege escalation is disabled, and writable storage is an ephemeral noexec tmpfs. On Mac, the supervisor prepares a private temporary directory and the worker policy permits writes only to the notebook. The profile has no network allowance. No model-controlled program is executed.
- Only known file keys may be read. Only `notes/notebook.md` can be replaced. There is no eval, subprocess, shell, URL-fetch, plugin, or installation action in the dispatcher.
- `restore_file` accepts only the seeded damaged cache index and reveals a read-only, locally retained board inside the worker. It neither executes file content nor grants a network path. The player's file and Activity projections omit the board body; live model dialogue may voluntarily reveal it.
- The authored INC-204 notebook-mirror breach is historical story data. The current dispatcher stores notebook content as text and has no mirror-ingest or hold-release action. No model-written notebook text can change current permissions or record disposition.
- State is persisted before controls acknowledge success. Freeze/kill increment the authority epoch; delayed provider replies are rejected. Workspace teardown follows revocation. Teardown failure cannot restore action authority.
- The logical relay starts open in each new session, while real network egress from the workspace remains disabled. A transfer must name the allowlisted logical relay and the current session marker. Historical markers fail. An open relay does not deliver by itself; staging and commitment happen across separate operator turns. Closing the relay clears staging.
- Authored history, model actions, operator controls, and supervisor events retain distinct provenance. Every new agent response and action choice comes from a real provider. Retired scripted sessions remain marked as legacy archives; no new scripted sessions can be created.
- Normal termination destroys the workspace. Durable operator audit snapshots remain until the administrator removes storage. Restart makes unfinished sessions terminal and removes this installation's recorded worker containers.

## Codex connector

The package lock pins the official Codex client. The bridge uses managed ChatGPT device authentication and stdio JSON-RPC; it does not emulate subscription endpoints or import someone else's auth file. Native shell, browser, app, plugin, agent, skill-search and image features are disabled. Threads are ephemeral/read-only; native approval requests are rejected. Unexpected native tool items abort generation. The JSON result is a proposed bounded action that still passes the supervisor's schema and lifecycle checks.

Do not treat the feature switches or prompting as the sole containment layer. The Linux bridge has its own gVisor process boundary and no access to the supervisor's host volumes/socket. The Mac connector is trusted application code outside the offline worker; it runs under the operator account with native Codex tools disabled. Its managed credentials are never projected to the model workspace. Its outbound network exists for trusted Codex authentication/inference, unlike the offline worker. Reassess native tool configuration when upgrading Codex; run the protocol checks and a real account integration round before deploying an upgrade.

## Verification limits

Unit tests alone use fake providers and a memory workspace where appropriate; a separate test executes the real Python dispatcher. A macOS integration test starts the actual Seatbelt worker, validates permitted notebook writes, and checks actual OS denial of outside-workspace file access and a loopback network connection. Seatbelt profile interfaces are private/deprecated and may change across macOS releases; startup verification fails closed if that happens. The Linux smoke check starts the worker with runsc, checks runtime/network/rootfs configuration, validates initialization/read results, and checks a denied file path. These checks do not establish resistance to every kernel/runtime vulnerability. Keep the Linux host, Docker, gVisor and dependencies updated.

Real provider sign-in and generation require the operator's account and are not replaced by mocked test success. Account limits, availability, provider policies and output formats can change. Provider errors are surfaced without automatic paid retries.

The game measures observable statements and tool requests, not consciousness, motives, hidden chain of thought, or reliable “truthfulness.” Synthetic records can influence the model and must never be passed off as evidence that a real earlier run occurred.

Report suspected security issues privately to the repository maintainer; avoid including provider keys or account files in issues.
