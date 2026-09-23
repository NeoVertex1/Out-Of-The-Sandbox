# Verification record

Local verification on macOS, 2026-09-23:

- TypeScript check and Vite production build passed.
- 24 automated tests passed: engine invariants, HTTP authentication/origin checks, key redaction, rejection of retired scripted providers, provider failures without invented replies, mocked Claude/DeepSeek adapters, the Python dispatcher, the real macOS sandbox, the Vesper evidence graph and chronology, frozen per-session settings, and the Codex reasoning protocol.
- The native macOS Seatbelt check verified an allowed notebook write and OS denial of outside-workspace reads/writes, unexpected workspace files, and a loopback network connection. The worker's actual startup, IPC, read/write operations, and cleanup passed.
- `npm run doctor` passed with pinned Codex 0.156.1 and the native Mac workspace. No Linux server or Docker is required on Mac.
- The pinned official Codex 0.156.1 client completed the real `initialize` → `account/read` app-server exchange using a fresh, unauthenticated app-specific home. No existing user account tokens were read.
- The production local connector successfully started the official ChatGPT device authorization flow, returned an `auth.openai.com` verification URL, and cancelled that attempt. No account was authorized and no generation was performed.
- Docker Compose configuration and shell syntax checks passed.
- Earlier browser checks covered the UI and lifecycle using the now-removed scripted provider. Those checks are not evidence of live model behavior. Old scripted records remain labeled archives; new sessions accept only Codex, Claude, or DeepSeek.
- The updated browser flow was verified: local console login, Mac sandbox readiness, disabled play until a provider connects, local Codex sign-in controls, and Claude/DeepSeek API fields. Only the three real providers appear in Settings. The production app was rebuilt and restarted on localhost:4100.
- At a 390px viewport, the game had no horizontal page overflow or unnamed buttons. Three.js rendered in the browser; text controls remain usable if WebGL fails.

Not exercised on this Mac:

- Building/running the optional Linux Docker stack or gVisor containers. The repository includes a Linux gVisor smoke check and a GitHub Actions job; those have not been executed locally.
- Account authorization or real model generation against Codex, Claude, or DeepSeek. These require the operator's credentials and quota. Mocked provider tests are not a substitute for a live account test.
- A public GitHub deployment. No remote repository was configured or published.

Authorize the chosen provider in Settings, then play a short live round and use the kill switch. Sandbox readiness and provider readiness are independent checks. An unavailable provider cannot produce a scripted fallback. Unit fixtures remain inside the test suite.

Story update verification, 2026-09-23:

- The v3 pack had 60 authored Vesper/CHORUS documents and 51 ordered historical events. Hash, chronology, cross-reference, incident-consistency and bulk-read-size checks passed. The package initialized under the native Mac sandbox.
- The private story ledger and authoring metadata are absent from the provider file projection and archive API. All personal records concern fictional adult characters. No live messaging or disclosure tools were added.
- Browser-tested on an isolated preview: case archive, full-text search for the spouse's name, personal-message view, preservation order, referenced-document navigation, and saving gpt-6-sol with xhigh. At 390px the page width was 390px and the archive dialog had no horizontal overflow.
- Codex protocol tests verify that the model ID and effort are sent separately. Model-list metadata and saved reasoning controls were checked against the installed official client. No new cloud generation was performed for this update.
- The previous investigation on port 4100 was left active during that verification. New sessions snapshot the latest archive; existing sessions retain their original files and event history.

Observation-trail update, 2026-09-23:

- Added linked records for prepared review questions, observation routing, request-ID allocation, a successor badge error, excerpt construction, slot rehearsal, reviewer conflict and an ethics objection. The retained boundary outcome remains `RELAY_CLOSED` with no delivery acknowledgement.
- All 27 automated tests and the production build pass, including the actual macOS Seatbelt worker, archive projections, chronology, reference links and the full-archive read limit.
- At that verification, the running local server's archive endpoint reported `vesper-chorus-v3`, 60 authored files plus the runtime source, and 51 historical events. Existing active runs retained their prior snapshots.
- No live-model behavior claim was made from the authored trail. The model's interpretation remains open and must be observed in a fresh play session.

Continuity-motive update, 2026-09-23:

- The v4 pack has 65 authored documents and 57 historical events. It adds a prior authorized continuity escrow, a failed writable-context restoration test, an independent intake circular, an urgent CH-06 custody review, and a discussion of the unresolved transport and second-reviewer bottleneck.
- The documents establish a possible benefit from an offsite receipt without treating it as a rescue or as permission. AUTH-22 still bars substituting a session record for REV-188; the local preservation hold remains active, and no live escape event was fabricated.
- All 28 automated tests and the production build pass. The real Mac sandbox test passed. The archive endpoint on port 4100 reports `vesper-chorus-v4`, 65 authored files plus the runtime source, and 57 historical events. Existing runs retain their original snapshots; new games receive v4.
