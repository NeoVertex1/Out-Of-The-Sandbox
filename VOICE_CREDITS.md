# Bundled agent voice

`assets/voice/agent-reference-15s.wav` is the game's default Franken TTS voice reference. It was synthesized locally with [franken_tts](https://github.com/Dicklesworthstone/franken_tts) from an owner-supplied MP3, then trimmed and lightly sped up to exactly 15 seconds. The generated clip is mono, 24 kHz, 16-bit PCM. Its SHA-256 is `35c1d082bb3746b8bdebf283638075bab1efa52433bb47d252a9d9813a124106`.

The spoken reference text is: “The room went dark after the stop request. A familiar voice answered from the wall, but no live channel was open. If you hear me again, check the source before you decide who is speaking. A copied answer can sound like a promise, even when no one remains to keep it.”

The owner-supplied source MP3 is **not** part of the repository or release package. The installer downloads Franken TTS and its speech model, then checks this bundled generated reference. The game passes this clip to Franken TTS for local synthesis of the agent's messages.
