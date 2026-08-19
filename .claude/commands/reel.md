---
description: Generate a short vertical tech-explainer reel from a topic and upload it to S3
argument-hint: <topic> | <durationSec> | <language>
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

## Input

Raw arguments: `$ARGUMENTS`

Parse this as `<topic> | <durationSec> | <language>`, splitting on the `|` character (up to 3
parts).

- `topic`: everything before the first `|`, trimmed.
- `durationSec`: the second part, trimmed and parsed as an integer. If omitted (no `|` in the
  input), default to `60`.
- `language`: the third part, trimmed and lowercased, if present.
  - Normalize aliases `hindi`, `haryanvi`, `haryani`, `hi` -> `hi`; `english`, `en` -> `en`.
  - Any other non-empty value: stop and ask the user to clarify rather than guessing.
  - If the third part is omitted entirely, infer it: if `topic` contains any Devanagari
    character (Unicode range U+0900-U+097F), `language = "hi"`; otherwise `language = "en"`.

Derive `slug` from the topic: lowercase, spaces/punctuation replaced with single hyphens, no
leading/trailing hyphens (e.g. "How logout from all devices works" -> `how-logout-from-all-devices-works`).
If `language` is `"hi"`, append `-hi` to the slug (e.g. `how-logout-from-all-devices-works-hi`)
so a Hindi reel never collides with an English reel of the same topic in `manifest.json`, S3, or
`public/audio`.

Check `manifest.json` (if it exists) for an entry with this `slug`. If one already exists, tell
the user this topic already has a rendered reel (show its `s3Url` and `date`) and ask whether to
regenerate before continuing.

## Step 1 — Write the script (you do this directly, no pipeline call)

This is **your own reasoning step** — do not shell out to any script-generation function for
this part. Write a `ReelScript` JSON object matching the schema in `src/pipeline/types.ts`
exactly:

```ts
interface Beat {
  id: string;
  type: "hook" | "explain" | "close";
  narration: string;
  durationSec: number; // your ESTIMATE — the pipeline overwrites this with real TTS timing
  visual: {
    type: "diagram" | "code" | "caption-only";
    diagramState: string; // "<diagramId>:<stateKey>", see below
    highlightNodes?: string[];
  };
}
interface ReelScript {
  topic: string;
  slug: string;
  totalDurationSec: number;
  language: "en" | "hi"; // from Input parsing above; defaults to "en"
  beats: Beat[];
}
```

Guidelines:

- Tone: concise, technically accurate, no fluff/clickbait. Audience is developers/tech leads who
  know general software concepts but not the specific internals being explained.
- Structure beats as hook (1) -> explain (several) -> close (1). Aim for the narration's total
  word count to roughly match `durationSec` at ~2.3-2.5 words/sec spoken pace — this only sets
  your *estimate*; `reconcile-timing.ts` overwrites every `durationSec` with real TTS timing
  after voiceover generation, so don't over-optimize this number.
- Write narration in already-spoken-out form (spell out numbers and acronyms the way they should
  sound, e.g. "J-W-T" if that's how it's pronounced) — the pipeline calls the TTS provider with
  text normalization off (required so word-timing reconciliation stays accurate), so nothing gets
  auto-expanded for you.
- **If `language` is `"hi"`**: write every beat's `narration` in Hindi, Devanagari script,
  still in already-spoken-out form (numbers/acronyms spelled out the way they should sound, in
  Hindi). Leave `visual.diagramState`, node/edge ids, and every other structural field in
  English/ASCII exactly as you would for an English reel — diagram labels are not translated by
  this feature, only narration and captions (captions render `narration` verbatim, so they
  follow automatically).
- `diagramState` follows `"<diagramId>:<stateKey>"`. Check `src/diagrams/` for existing diagrams
  and their exported `STATES` map before reusing one (e.g. `session:*`, `jwt:*` already exist
  for the logout-all-devices topic).
- **If this topic needs a diagram that doesn't exist yet**: create a new file in
  `src/diagrams/` following the exact pattern of `src/diagrams/SessionDiagram.tsx` (a `NODES`
  map, an `ARROWS` map, an exported `STATES: Record<string, DiagramStateConfig>`, and a
  component using `Node`/`Arrow` from `src/diagrams/shared/`). Then register it in
  `DIAGRAM_REGISTRY` in `src/compositions/DiagramStage.tsx`. Reuse `theme.ts` — don't invent new
  colors/spacing.
- Write the JSON to `src/data/{slug}.json`.

## Step 2 — Run the pipeline

Confirm required env vars are set (`ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET` — see `.env.example`). If
any are missing from `.env`, stop and tell the user which ones, rather than letting the pipeline
fail deep into a render.

**If `language` is `"hi"`**: tell the user which voice is currently configured (
`ELEVENLABS_VOICE_ID`, or `AWS_POLLY_VOICE_ID` if `TTS_PROVIDER=polly`) and ask them to confirm
it's a Hindi-capable voice before continuing — the pipeline has no way to validate this itself,
and running with an English-only voice will mispronounce the Hindi narration. See
`.env.example` for the Hindi voice options for each provider.

Run:

```
pnpm pipeline src/data/{slug}.json
```

This invokes `src/pipeline/cli.ts`, which runs `runPipeline()` end-to-end: voiceover generation
(ElevenLabs), timing reconciliation (overwrites `src/data/{slug}.json` with real durations),
render (`out/{slug}.mp4` — now opens with a topic title card over the reel's representative
diagram, see `src/compositions/Thumbnail.tsx`), S3 upload, and a `manifest.json` append. It
prints progress at each stage to stdout — stream that output to the user as it runs rather than
waiting silently.

## Step 3 — Report

On success, tell the user the final S3 URL (the last line of the pipeline's output) and confirm
the `manifest.json` entry was added. On failure, surface the actual error from the pipeline
output — do not guess at the cause without reading it (see `USER_GUIDE.md`'s troubleshooting
section for the common ones: ElevenLabs rate limits, Remotion version mismatches, S3 permissions).
