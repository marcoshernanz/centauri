# Centauri Chrome Extension

Centauri is a Chrome extension that lets you execute web tasks in natural language from a floating command shell.
It is optimized for fast, visible navigation and reliable summaries. Also with extra feature to add notes to your pages.
Imporve the usage of LLMs and AI agents on your daily searchs.

## Developers

1. Marcos Hernanz
2. Javier Gil
3. Martí Massó
4. Marc Altabella

## How The Models Are Used

- Claude (Anthropic): main agent/planner/summarizer for text and task execution.
- Gemini: image analysis path when the user submits a selected image.
- ElevenLabs: text-to-speech & speech-to-text

## Configure Your Keys

Create a `.env` file in the project root:

```bash
ANTHROPIC_API_KEY=your_anthropic_key
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-2.5-flash
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_VOICE_ID=your_voice_id
ELEVENLABS_SPEECH_PROFILE=eleven_multilingual_v2
```

Notes:
- `ANTHROPIC_API_KEY` is required for the core agent experience.
- `GEMINI_*` is required for image-selected tasks.
- `ELEVENLABS_*` is required for speaker playback.
- Keys are injected at build time by `scripts/build.mjs`.

## Build The Extension

```bash
npm install
npm run typecheck
npm run build
```

Build output is generated in `dist/`.

## Load Into Chrome (Developer Mode)

1. Open `chrome://extensions`.
2. Enable `Developer mode` (top-right).
3. Click `Load unpacked`.
4. Select the project `dist/` folder.
5. Pin the extension if needed.

After code changes:
- Run `npm run build` again.
- Click `Reload` on the extension card in `chrome://extensions`.

## Run And Use

1. Open any page (for demo: `news.ycombinator.com` or `mail.google.com`).
2. Press `Ctrl+Shift+Space` (macOS: `Command+Shift+Space`) to open Centauri.
3. Type a prompt and press Enter.
4. Watch states progress (`Planning` -> `Executing` -> `Summarizing` -> result).

Suggested demo prompts:
- `Summarize the top 5 hackernews articles`
- `Give me a summary of my last 5 unread emails`

Mode behavior:
- `A` (Agentic): full navigation/actions.
- `C` (Chat): read-only DOM chat response (except hardcoded HN/Gmail flows that stay deterministic).

Optional helper commands:

```bash
npm run test:demo:hn
npm run test:demo:gmail
npm run test:perf
npm run test:rehearsal
```
