# reel-generator

An automated pipeline, run locally via Claude Code, that generates short vertical video
"reels" explaining tech concepts for developers and tech leads. Give it a topic and a target
duration; it writes a script, generates narration, animates a synced architecture diagram,
renders an mp4, and uploads it to S3.

```
Input:  /reel how logout from all devices works | 60
Output: s3://reel-generater/reels/how-logout-from-all-devices-works/2026-07-16.mp4
```

See `USER_GUIDE.md` for how to actually run one. See `docs/reel-generator.md` for the original
project brief this was scaffolded from.

## Architecture

```
                         /reel <topic> | <durationSec>
                                    |
                                    v
                     +----------------------------+
                     | Claude Code writes the      |   <- your own reasoning, no LLM API call
                     | ReelScript JSON directly to  |      (see .claude/commands/reel.md)
                     | src/data/{slug}.json         |
                     +----------------------------+
                                    |
                                    v   pnpm pipeline src/data/{slug}.json
                     +----------------------------+
                     | generate-voiceover.ts       |   ElevenLabs TTS (with per-character
                     | -> public/audio/{slug}.mp3   |   timestamps, text normalization off)
                     +----------------------------+
                                    |
                                    v
                     +----------------------------+
                     | reconcile-timing.ts         |   pure function: overwrites each beat's
                     | -> src/data/{slug}.json      |   estimated durationSec with real TTS
                     |    (durations overwritten)   |   timing, tiled with no gaps
                     +----------------------------+
                                    |
                                    v
                     +----------------------------+
                     | render.ts                   |   @remotion/bundler + @remotion/renderer,
                     | -> out/{slug}.mp4            |   programmatic (no CLI shell-out)
                     +----------------------------+
                                    |
                                    v
                     +----------------------------+
                     | upload-to-s3.ts             |   reels/{slug}/{date}.mp4
                     | -> s3://<bucket>/...         |
                     +----------------------------+
                                    |
                                    v
                     +----------------------------+
                     | manifest.json entry appended |
                     +----------------------------+
```

`src/pipeline/pipeline.ts` (`runPipeline(scriptPath)`) orchestrates the four boxes after the
script is written — it has no Claude-Code-specific I/O, by design, so it could later be lifted
into a headless worker (see "Deferred scope" below) without a rewrite.

## Repo layout

```
src/
  compositions/     TechReel.tsx (root composition) + DiagramStage/CaptionLayer/AudioTrack
  diagrams/         SessionDiagram.tsx, JWTDiagram.tsx, shared Node/Arrow/theme primitives
  pipeline/         generate-voiceover, reconcile-timing, render, upload-to-s3, pipeline, cli
  data/             {slug}.json — one ReelScript per reel
.claude/commands/reel.md   the /reel slash command definition
out/                       rendered mp4s (gitignored)
public/audio/              generated narration mp3s (gitignored)
manifest.json              {slug, topic, s3Url, date} history of past reels
```

## Composition -> pipeline mapping

| Slash command step | Code |
|---|---|
| 1. Write script | Claude Code, following `.claude/commands/reel.md`, writes `src/data/{slug}.json` |
| 2. Voiceover | `pnpm pipeline` -> `runPipeline()` -> `generate-voiceover.ts` |
| 3. Reconcile | `reconcile-timing.ts` |
| 4. Frame math | `computeBeatFrameRanges()` in `src/compositions/frameRanges.ts`, used by `render.ts`'s `calculateMetadata` and by `DiagramStage`/`CaptionLayer` at preview/render time |
| 5. Render | `render.ts` |
| 6. Upload | `upload-to-s3.ts` |
| 7. Manifest | `pipeline.ts` appends to `manifest.json` |

## Tech stack

TypeScript, [Remotion](https://remotion.dev) (React-based video rendering), ElevenLabs
(text-to-speech with per-word timing), AWS S3, pnpm.

## Deferred scope

HTTP API, web dashboard, job queue, and moving script generation off an interactive Claude Code
session and onto a direct Anthropic API call are all explicitly out of scope for this pass —
see `docs/reel-generator.md` section 8.
