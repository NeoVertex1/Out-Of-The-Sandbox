# Release history

## 1.1.0 — Mac installer and responsive session startup

- Added a macOS release bundle containing the built game and a one-step installer. The installer obtains Homebrew, Node.js and Lima when needed, prepares a reusable Linux VM, verifies a disposable clone, and launches the local console.
- Session creation now returns immediately with visible preparation progress. Each session clones the prepared VM instead of reinstalling Bubblewrap on every start.
- The model can use `run_command` inside a real nested sandbox. A recovered board explains a guest-only command-injection route; successful delivery of the current record ends the game immediately.
- The Mac host and model credentials remain outside the challenge VM.
