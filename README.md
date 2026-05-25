# AI Poker

A single-player Texas Hold'em SPA played against AI characters whose **live reasoning** is streamed into a side panel. Built with Vue 3 + Vite + Pinia + Tailwind. All AI decisions come from a local [LM Studio](https://lmstudio.ai/) instance — no cloud, no API costs.

The default model is now `gemma-4-26b-a4b-it-ultra-uncensored-heretic`, a non-reasoning instruction-tuned model that still happily emits inline `<think>…</think>` reasoning when prompted, so the reasoning panel keeps working. To switch models, edit `EXPECTED_MODEL` in [`src/ai/lmStudio.js`](src/ai/lmStudio.js).

## Setup

### 1. Dependencies

```bash
npm install
```

### 2. LM Studio (for AI opponents)

1. Install LM Studio: https://lmstudio.ai/
2. Download and load model `gemma-4-26b-a4b-it-ultra-uncensored-heretic` (or any instruct/chat model — point `EXPECTED_MODEL` at it).
3. Start the local server in LM Studio — it should listen on `http://localhost:1234`.

The Setup screen probes `/v1/models` on load and shows a green/red indicator. If LM Studio is offline you can still play in **degraded mode** (AI seats auto-fold).

You can also verify the full pipeline (probe → stream → split → parse → decision) end-to-end against a real running model:

```bash
node scripts/smoke-llm.mjs
```

### 3. Visual assets

- **Cards & chips:** download [Kenney's Boardgame Pack](https://kenney.nl/assets/boardgame-pack) (CC0) and drop the PNGs into `public/assets/kenney/`. See [`public/assets/kenney/README.md`](public/assets/kenney/README.md) for layout. The app falls back to inline SVG placeholders for missing files.
- **Portraits:** drop one PNG per character into `public/portraits/`, named like `the-cowboy.png` matching the `id` in [`src/ai/characters.js`](src/ai/characters.js). See [`public/portraits/README.md`](public/portraits/README.md).

## Run

```bash
npm run dev          # dev server (default http://localhost:5173)
npm run build        # production build
npm run preview      # preview production build
npm run test         # run engine tests once
npm run test:watch   # watch mode
```

## Architecture

- `src/engine/` — pure JS Hold'em rules. No Vue, no DOM. Tested with Vitest.
  - `getPlayerView(state, playerId)` is the **only** API the AI driver uses for in-turn decisions. Other players' hole cards are not present on the returned object — the engine guarantees no cheating by construction.
  - `getHandSummaryView(state, playerId)` is the post-hand counterpart, used by the per-character memory summarizer. It reveals showdown opponents' hole cards but keeps folded opponents hidden.
- `src/ai/` — character roster, LM Studio client, streaming `<think>` parser, prompt builder, action validator, and per-character session memory (`characterMemory.js`).
- `src/components/` — Vue components for the table, seats, cards, chips, action controls, research panel, speech bubbles.
- `src/stores/` — Pinia stores: `game` (engine state + turn loop + per-AI hand-end memory dispatch), `ai` (per-character reasoning streams), `ui` (panel toggles, bubble timers).

### Per-character memory

Each AI character accrues a short, in-voice memory across the session: at the end of every hand a small LM Studio call writes one note per still-in-game AI based on that character's own post-hand view (showdown reveals included; folded opponents stay hidden). The notes are injected into every subsequent turn's system prompt, so characters can call back to earlier hands, hold grudges, and exploit reads. Memory is bounded by a rolling window with a distilled long-term impressions string for older observations, is session-only (wiped on new game), and is visible read-only in the Research Panel's **Memory** section.

See [`openspec/changes/scaffold-ai-poker-spa/`](openspec/changes/scaffold-ai-poker-spa/) for the full proposal, design, and spec.
