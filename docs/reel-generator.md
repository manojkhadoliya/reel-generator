# Project Brief: `reel-generator`

## 1. What this project is

An automated pipeline, run locally via Claude Code, that generates short vertical
video "reels" explaining tech concepts for developers / tech leads. Input is a
topic + target duration; output is a rendered `.mp4` uploaded to S3.

**Example:**
```
Input:  /reel how logout from all devices works | 60
Output: s3://<bucket>/reels/how-logout-from-all-devices-works/2026-07-16.mp4
```

**Scope for this pass:** local run only, driven by a Claude Code slash command.
No API server, no web dashboard, no job queue. Those are explicitly deferred —
see section 8.

## 2. Audience & content style

- Audience: developers, tech leads, engineering-adjacent people.
- Tone: concise, technically accurate, no fluff/clickbait. Assume the viewer
  knows general software concepts but not the specific internals being explained.
- Visual style: **text captions + animated architecture diagrams** (not talking-head,
  not stock footage, not plain typography-only). Diagrams should visually show
  the mechanism (e.g. boxes for Client/Server/DB, animated arrows for requests,
  state changes like "session deleted" happening on screen in sync with narration).
- Default length: 45–60 seconds unless specified otherwise per topic.

## 3. Confirmed tech decisions

| Concern | Decision |
|---|---|
| Repo layout | **Single repo** (not monorepo — no second deployable exists yet; revisit if/when the dashboard is built, see section 8) |
| Video rendering | **Remotion** (React-based, frame = React render) |
| Script/narration generation | **Option A: Claude Code writes it directly.** No LLM API call, no `ANTHROPIC_API_KEY` needed for this pass. Claude Code, running interactively via the slash command, writes the beats JSON straight to disk as part of executing the command. |
| TTS | **ElevenLabs** (per-word timestamp API is a hard requirement — needed to sync diagram animation beats to speech) |
| Cloud | AWS — **S3 only** for this pass (upload destination for the finished mp4). No SQS/DynamoDB/Lambda yet — those were part of the deferred API/dashboard scope. |
| Storage of finished videos | S3, key pattern `reels/{slug}/{date}.mp4` |
| Local dev package manager | pnpm |
| Language | TypeScript throughout |

## 4. Repo structure to scaffold

```
reel-generator/
├── src/
│   ├── compositions/
│   │   └── TechReel.tsx          # root: AudioTrack + CaptionLayer + DiagramStage
│   ├── diagrams/
│   │   ├── SessionDiagram.tsx    # first diagram scene (logout-all-devices topic)
│   │   ├── JWTDiagram.tsx        # second diagram scene (same topic, token variant)
│   │   └── shared/
│   │       ├── Node.tsx          # reusable box (client/server/db icon + label)
│   │       ├── Arrow.tsx         # animated connector, spring()-eased
│   │       └── theme.ts          # shared colors/fonts/spacing — invest real effort
│   │                             #   here since every future reel depends on it
│   ├── pipeline/
│   │   ├── generate-voiceover.ts # narration text -> ElevenLabs -> mp3 + word timestamps
│   │   ├── reconcile-timing.ts   # maps real TTS timestamps back onto beats
│   │   │                         #   (this is the step most naive pipelines skip —
│   │   │                         #   do not hardcode estimated durations anywhere)
│   │   ├── render.ts             # calls @remotion/renderer programmatically
│   │   ├── upload-to-s3.ts
│   │   ├── pipeline.ts           # exported runPipeline(scriptPath): Promise<{s3Url}>
│   │   │                         #   NOTE: takes a scriptPath, not a topic — the topic
│   │   │                         #   -> script step happens in Claude Code itself
│   │   │                         #   (see section 6), not inside this function.
│   │   └── types.ts              # Beat, DiagramState shared types
│   └── data/
│       └── {slug}.json           # beats JSON files Claude Code writes per reel, one per topic
│
├── .claude/
│   └── commands/
│       └── reel.md               # slash command definition, see section 6
│
├── out/                          # local mp4 render output (gitignored)
├── manifest.json                 # local record of {slug -> s3Url -> date} to avoid topic overlap
├── package.json
├── .env.example
├── README.md                     # what this is, quickstart, architecture overview
└── USER_GUIDE.md                 # step-by-step: how to run a reel end-to-end locally
```

## 5. Data model (must be implemented exactly)

### Beat (in `src/pipeline/types.ts`)
```ts
interface Beat {
  id: string;
  type: "hook" | "explain" | "close";
  narration: string;              // spoken text for this beat
  durationSec: number;             // ESTIMATED first, then OVERWRITTEN after TTS reconciliation
  visual: {
    type: "diagram" | "code" | "caption-only";
    diagramState: string;          // key into the relevant diagram's state machine
    highlightNodes?: string[];     // node/edge ids to animate in during this beat
  };
}

interface ReelScript {
  topic: string;
  slug: string;
  totalDurationSec: number;
  beats: Beat[];
}
```

## 6. Pipeline sequencing

1. **Claude Code writes the script** — when you run `/reel <topic> | <duration>`,
   Claude Code (using its own reasoning, no separate API call) writes a `ReelScript`
   JSON object to `src/data/{slug}.json`, with estimated `durationSec` per beat.
2. **Voiceover**: `generate-voiceover.ts` is called (by Claude Code, as the next
   step in the slash command) with the concatenated narration text. Calls
   ElevenLabs, returns mp3 + per-word timestamps.
3. **Reconcile**: `reconcile-timing.ts` recomputes each beat's real `durationSec`
   from actual timestamps, overwrites the estimates in the JSON file.
4. Only after reconciliation, calculate total frame count (`durationSec * fps`)
   and per-beat frame ranges for Remotion.
5. **Render**: `render.ts` renders the `TechReel` composition, fed the reconciled
   beats JSON + audio file as `inputProps`, outputs to `out/{slug}.mp4`.
6. **Upload**: `upload-to-s3.ts` uploads the mp4 to S3.
7. Append an entry to `manifest.json` (slug, topic, s3Url, date) so future reel
   topics can be checked against what's already covered.

## 7. Claude Code slash command spec

File: `.claude/commands/reel.md`

Behavior:
- Input format: `/reel <topic> | <durationSec>` (default durationSec = 60 if omitted).
- Step 1 (scripting) is performed by Claude Code directly — write the JSON file,
  do not shell out to any script-generation function for this step.
- Steps 2 onward are performed by invoking the corresponding TypeScript functions
  in `src/pipeline/` (via `tsx` or a small CLI runner — Claude Code's choice, document it).
- Prints progress at each pipeline stage.
- On completion, prints the final S3 URL and appends to `manifest.json`.

## 8. Explicitly out of scope for this pass (deferred, not forgotten)

- HTTP API, web dashboard, async job queue (SQS), job status store (DynamoDB),
  Lambda-based rendering.
- `ANTHROPIC_API_KEY` / calling the Anthropic API directly for script generation.
- Monorepo structure (`packages/core`, `packages/api`, `packages/web`, etc.)

**When this scope is picked back up:** script generation will need to move from
"Claude Code writes it interactively" to "a callable function that calls the
Anthropic API directly," since a headless API worker has no Claude Code session
available to it. At that point, extracting the current `src/pipeline/` folder
into a `packages/core` workspace package is a mechanical refactor, not a rewrite —
keep `pipeline.ts`'s functions cleanly separated from anything Claude-Code-specific
now so that move is easy later.

## 9. Documentation deliverables (required, not optional)

- `README.md`: what the project does, architecture overview (ASCII diagram of
  the pipeline is fine), how the slash command maps to the pipeline steps.
- `USER_GUIDE.md` covering:
  - Prerequisites (Node version, pnpm, AWS CLI configured, ElevenLabs API key)
  - How to run a reel generation end-to-end via the `/reel` slash command
  - How to preview a composition locally before committing to a full render
    (`npx remotion preview`)
  - How to check `manifest.json` for past reels
  - Troubleshooting section (common Remotion render errors, ElevenLabs rate
    limits, S3 permission issues)
- `.env.example` listing every required environment variable with a one-line
  comment on where to get it (should only be ElevenLabs + AWS credentials for
  this pass — no Anthropic key needed).

## 10. Open questions — Claude Code must ask the user these before generating code

1. **AWS specifics**: What S3 bucket name/region should be used? Does the bucket
   already exist, or should setup instructions be included to create it?
2. **Node/pnpm versions**: Any existing version constraints from other projects
   on this machine to match?
3. **First diagram scenes**: Confirm the first reel to build/test end-to-end is
   "how logout from all devices works" (Session + JWT diagrams as scoped in
   section 4), so the initial `SessionDiagram.tsx` / `JWTDiagram.tsx` aren't
   generic placeholders.
4. **Remotion render runner**: Invoke via `@remotion/renderer` programmatically
   from a small Node script, or shell out to the `npx remotion render` CLI from
   within the slash command? (Programmatic is easier to unit test and to later
   lift into `packages/core` per section 8; CLI is simpler to get working first.)

## 11. Definition of done for this scaffolding pass

- [ ] Repo installs cleanly with `pnpm install`.
- [ ] `src/pipeline/` functions (voiceover, reconcile, render, upload) are fully
      typed and independently testable/mockable.
- [ ] `TechReel.tsx` previews locally via `npx remotion preview`, including at
      least the Session diagram scene wired to sample beat data.
- [ ] `/reel` slash command runs the full pipeline end-to-end locally — script
      write, voiceover, reconcile, render, upload — and produces a real mp4 in
      `out/` and a URL in S3.
- [ ] `README.md` and `USER_GUIDE.md` exist and are accurate to what was built.
- [ ] `.env.example` is complete and matches every env var actually referenced
      in code (should be ElevenLabs + AWS only).