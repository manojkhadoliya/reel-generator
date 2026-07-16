# User Guide

## Prerequisites

- Node.js 24+ and pnpm 11+ (`node --version`, `pnpm --version`).
- An [ElevenLabs](https://elevenlabs.io) account with an API key and a voice ID you want to use
  for narration.
- AWS credentials for an IAM identity with `s3:PutObject` (and ideally `s3:ListBucket`,
  `s3:DeleteObject` for cleanup) on the target bucket.
- The AWS CLI installed if you want to run the manual S3 permission check below (`aws --version`).

## Setup

```
pnpm install
cp .env.example .env
```

Fill in `.env`:

| Variable | Where to get it |
|---|---|
| `ELEVENLABS_API_KEY` | https://elevenlabs.io/app/settings/api-keys |
| `ELEVENLABS_VOICE_ID` | https://elevenlabs.io/app/voice-library — copy the voice's ID |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | IAM user/role credentials with `s3:PutObject` on the bucket below |
| `AWS_REGION` | Region the S3 bucket lives in |
| `S3_BUCKET` | Bucket that finished reels get uploaded to |

`.env` is gitignored — never put real credentials in `.env.example`.

## Running a reel end-to-end

In Claude Code, from the project root:

```
/reel how logout from all devices works | 60
```

This is a single command — Claude Code parses the topic and duration, writes the beats script
itself, then runs the rendering pipeline and reports back the final S3 URL. You'll see progress
printed at each stage: voiceover generation, timing reconciliation, rendering, upload.

If you'd rather drive the pipeline steps yourself (e.g. after hand-editing a script), you can
run the pipeline directly once `src/data/{slug}.json` exists:

```
pnpm pipeline src/data/{slug}.json
```

## Previewing a composition before a full render

Launch Remotion Studio to scrub through the composition interactively, using the sample data in
`src/data/sample-beats.json`:

```
pnpm dev
```

(Older Remotion tutorials use `npx remotion preview` — that's now an alias for
`npx remotion studio`, which is what `pnpm dev` runs.)

To render just a few frames as a smoke test without running the full pipeline:

```
npx remotion render TechReel out/smoke-test.mp4 --frames=0-10
```

Or a single still frame as a PNG, useful for eyeballing a specific diagram state:

```
npx remotion still TechReel out/frame.png --frame=90
```

## Checking past reels

`manifest.json` at the repo root records every reel that's been generated:

```json
[
  { "slug": "how-logout-from-all-devices-works", "topic": "...", "s3Url": "s3://...", "date": "2026-07-16" }
]
```

Check it before picking a new topic to avoid duplicating a reel that already exists. The `/reel`
command checks this automatically and will ask before regenerating an existing slug.

## Troubleshooting

**ElevenLabs `429 Too Many Requests`**
Free/low tiers cap concurrent requests and requests-per-minute. `generate-voiceover.ts` retries
automatically a few times with exponential backoff; if it still fails, wait a bit or check your
plan's tier. This project always calls ElevenLabs once per reel (all beats concatenated into a
single request), so this should be rare outside of rapid repeated runs.

**Narration sounds like it's reading digits/acronyms letter-by-letter, or mispronounces numbers**
Text normalization is intentionally disabled (`apply_text_normalization: "off"`) when calling
ElevenLabs — this is required so the per-character timestamps line up exactly with the text we
submitted, which `reconcile-timing.ts` depends on. Write narration already spelled out the way
it should sound (e.g. "twenty four hours" instead of "24 hours") rather than relying on
normalization.

**Remotion render fails with a "version mismatch" warning/error**
All four Remotion packages (`remotion`, `@remotion/cli`, `@remotion/renderer`,
`@remotion/bundler`) must be pinned to the *identical* exact version in `package.json` (no `^`).
Check `pnpm list remotion @remotion/cli @remotion/renderer @remotion/bundler` if you ever bump
one without the others.

**Remotion render fails trying to load the narration audio**
`render.ts` only runs after `generate-voiceover.ts` has written
`public/audio/{slug}.mp3` — Remotion's bundler only serves files that exist under `public/` at
bundle time. If you're driving pipeline steps manually out of order, make sure the mp3 exists
before calling `renderReel()`.

**Chromium/headless-shell download or launch errors (fresh machine)**
`@remotion/renderer` needs a Chrome Headless Shell binary; it downloads automatically on first
render. If that fails (e.g. restrictive network), try `npx remotion browser ensure` first.

**S3 upload fails with `AccessDenied`**
Verify the credentials in `.env` can actually write to the bucket before blaming the pipeline:

```
echo "test" > test.txt
aws s3 cp test.txt s3://<bucket>/reels/_permission-check/test.txt --region <region>
aws s3 rm s3://<bucket>/reels/_permission-check/test.txt --region <region>
rm test.txt
```

If that fails, the IAM identity needs `s3:PutObject` (and ideally `s3:ListBucket`,
`s3:DeleteObject`) on the bucket, not a pipeline code issue.

**TypeScript errors around `Composition` props**
The `TechReel` composition's props are defined via a zod schema
(`techReelPropsSchema` in `src/compositions/TechReel.tsx`), not a plain interface passed to
`<Composition>`. Remotion's prop-inference for `<Composition>` needs the `schema` prop to
correctly type `defaultProps`/`calculateMetadata` — see `src/Root.tsx` for the pattern.
