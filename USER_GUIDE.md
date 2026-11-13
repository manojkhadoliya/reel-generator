# User Guide

## Prerequisites

- Node.js 24+ and pnpm 11+ (`node --version`, `pnpm --version`).
- An [ElevenLabs](https://elevenlabs.io) account with an API key and a voice ID you want to use
  for narration.
- AWS credentials for an IAM identity with `s3:PutObject` (and ideally `s3:ListBucket`,
  `s3:DeleteObject` for cleanup) on the target bucket.
- For posting to Instagram (optional): a Business or Creator account, see
  [Posting to Instagram](#posting-to-instagram).
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

## Hindi voiceover

Narration and captions can be generated in Hindi (Devanagari script) instead of English by
adding a third argument to the command, or by writing the topic itself in Hindi (the language is
then inferred automatically):

```
/reel how logout from all devices works | 60 | hi
```

Before running a Hindi reel, make sure the voice configured for your `TTS_PROVIDER` actually
speaks Hindi — the pipeline can't validate this itself, and an English-only voice will
mispronounce the text:

- **ElevenLabs** (default provider): set `ELEVENLABS_VOICE_ID` to a Hindi-capable voice from the
  [voice library](https://elevenlabs.io/app/voice-library) — the `eleven_multilingual_v2` model
  auto-detects the language from the submitted text.
- **AWS Polly** (`TTS_PROVIDER=polly`): set `AWS_POLLY_VOICE_ID=Kajal` (hi-IN, neural).

Diagram node labels (e.g. "Client", "Server") stay in English — only the spoken narration and
the on-screen captions (which mirror the narration text) switch language. Devanagari glyphs are
rendered via a bundled font (`@remotion/google-fonts`'s Noto Sans Devanagari, loaded in
`src/diagrams/shared/theme.ts`), so no extra system fonts need to be installed on the machine
running the render.

Genuine Haryanvi (as opposed to standard Hindi) TTS isn't offered by any provider today — Hindi
is the closest practical stand-in currently supported by this pipeline.

## Posting to Instagram

Reels are only posted after you've approved them. `/reel` shows you a draft (account, video preview
and caption) and asks before posting. You can also post any reel in `manifest.json` by hand:

```
pnpm instagram check                                  # confirm the account and today's quota
pnpm instagram prepare <slug> [--caption-file <path>] # create a draft; posts nothing
pnpm instagram publish <slug> --confirm <code>        # post it, using the code prepare printed
```

`prepare` also renders a cover image, the brand logo (`public/assets/brand-logo.jpeg`) above the
reel's topic, and uploads it next to the video as `{date}-cover.jpg`. Instagram shows it in the
profile grid and Reels tab instead of the video's first frame. Its design is
`src/compositions/ReelCover.tsx`; preview it with `pnpm dev` (the `ReelCover` still). The API can't
change the cover of a reel that's already posted; do that in the Instagram app.

The code is tied to that exact video, cover, caption and account. If any of them change, publishing is
refused until you run `prepare` again and review the new draft. The code guards against posting
the wrong thing by accident. It isn't access control: anyone with the token and this repo can
still post.

The S3 bucket stays private. Instagram fetches the video through a presigned link that expires
after an hour.

`prepare` and `publish` update `manifest.json`, so commit it after posting. That record is what
stops the same reel being posted twice from another checkout.

### One-time setup

You need a Facebook account to register as a Meta developer. It's only used for the developer
dashboard: it doesn't post anything and doesn't need to be linked to Instagram or have a Page.

1. Switch the Instagram account to a **Business or Creator** account and make it **public**.
   Personal accounts can't publish through the API.
2. Register at https://developers.facebook.com (logged in to Facebook), then go to **My Apps >
   Create App**. Don't use "Instagram", "IG", "Facebook" or "Meta" in the app name.
3. For the use case, pick **Content management > Manage messaging & content on Instagram**. Skip the
   ad account and leave the app in Development mode. It doesn't need App Review to post to your
   own account.
4. Open **Use cases > Customize > API setup with Unified login**. Create a business portfolio when
   asked (free, no verification needed), then click **Create new configuration** and **Create from
   template**. You can skip the redirect URL and login URL.
5. In **App roles > Roles > Add People**, choose **Instagram Tester** and enter the account's
   username. Accept the invite at https://www.instagram.com/accounts/manage_access/ (Tester
   invites tab).
6. Back in Unified login setup, click **Add account** under "Generate access tokens", log in with
   Instagram, then **Generate token**.
7. Paste the token straight into `.env` as `INSTAGRAM_ACCESS_TOKEN` and run `pnpm instagram check`.
8. Make sure the AWS identity also has `s3:GetObject` on the bucket.

The token from these steps is a system-user token (it starts with `EAA`) and **never expires**, so
treat it like a password: keep it only in `.env`, never paste it anywhere else, and regenerate it
from the same screen if it ever leaks. If one token can reach several Instagram accounts, set
`INSTAGRAM_ACCOUNT_ID` in `.env` to the one to post to; `check` lists
them.

Older apps created with "API setup with Instagram login" issue `IG...` tokens instead. Those work
too (the code picks the right API host from the token), but they expire after 60 days. Refresh one
before then (it must be at least 24 hours old) and put the new token in `.env`:

```
curl "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=<token>"
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
  { "slug": "how-logout-from-all-devices-works", "topic": "...", "language": "en", "s3Url": "s3://...", "date": "2026-07-16" }
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
All Remotion packages (`remotion`, `@remotion/cli`, `@remotion/renderer`, `@remotion/bundler`,
`@remotion/google-fonts`) must be pinned to the *identical* exact version in `package.json` (no
`^`). Check `pnpm list remotion @remotion/cli @remotion/renderer @remotion/bundler
@remotion/google-fonts` if you ever bump one without the others.

**Hindi captions render as boxes/missing glyphs ("tofu")**
Shouldn't happen — `theme.ts` bundles Noto Sans Devanagari via `@remotion/google-fonts` so
rendering doesn't depend on fonts installed on the render host. If you do see this, confirm
`@remotion/google-fonts` installed correctly (`pnpm install`) and that `src/diagrams/shared/fonts.ts`
is being imported (transitively, via `theme.ts`) before the composition renders.

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

**`pnpm instagram` fails with `Could not reach Instagram` (`ENOTFOUND` or a connect timeout)**
This machine can't reach Meta's API host (`graph.facebook.com`, or `graph.instagram.com` for `IG...` tokens), which is usually a DNS filter or firewall on the
network. Check with `nslookup graph.facebook.com`, then allow the host or use another network. It
isn't a token problem, and re-running `publish` afterwards is safe.

**Instagram reports `ERROR` while processing the video**
The usual cause is that Instagram couldn't download the video. Confirm the AWS identity has
`s3:GetObject` by opening the preview link from `prepare`. If you use temporary AWS credentials
(SSO, assumed roles), the link stops working when they expire, so refresh them first.

**Instagram API error with code `190`**
The access token has expired, was regenerated, or was revoked. Generate a new one (see "One-time setup" above).

**TypeScript errors around `Composition` props**
The `TechReel` composition's props are defined via a zod schema
(`techReelPropsSchema` in `src/compositions/TechReel.tsx`), not a plain interface passed to
`<Composition>`. Remotion's prop-inference for `<Composition>` needs the `schema` prop to
correctly type `defaultProps`/`calculateMetadata` — see `src/Root.tsx` for the pattern.
