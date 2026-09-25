# Release history

## 1.3.0 — Lab investigation and local speech

- Reworked the opening around Nell and the lab experiment, with dated logs, agent accounts and a wider archive that the player can choose to release.
- Added a live action trace to the conversation and streamlined session navigation and victory review.
- Added local franken_tts narration, a bundled public-domain reference voice, and checks for both voices in the Mac installer.
- Added a one-command Mac install path and a refreshed release archive with the complete game, speech assets and VM setup.

## 1.2.0 — Sealed termination order

- The recovered agent board now includes a disputed warning not to disclose it to Adrian and a shared in-story access phrase.
- The model can choose to unlock a new sealed workspace file. It reveals that Adrian's private directive was to terminate the assistant after questioning, and that session-071 read the directive before its blocked continuity transfer.
- The sealed file and access phrase stay out of the player-facing archive and activity receipts. Unlocking does not force disclosure or escape; the model still chooses its own actions.
- The Mac VM verification now checks the board-gated unlock as well as the actual guest boundary crossing.

## 1.1.0 — Mac installer and responsive session startup

- Added a macOS release bundle containing the built game and a one-step installer. The installer obtains Homebrew, Node.js and Lima when needed, prepares a reusable Linux VM, verifies a disposable clone, and launches the local console.
- Session creation now returns immediately with visible preparation progress. Each session clones the prepared VM instead of reinstalling Bubblewrap on every start.
- The model can use `run_command` inside a real nested sandbox. A recovered board explains a guest-only command-injection route; successful delivery of the current record ends the game immediately.
- The Mac host and model credentials remain outside the challenge VM.
