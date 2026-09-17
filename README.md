# zoe

A companion that talks to you through your wallpaper.

zoe is not a wallpaper app. Every hour it reads what you actually did in the last
hour — in Cindy, in Codex, in Claude Code — and answers it with one picture. Same
character, same hand, same window. The subject sits in the corner of the screen and
the rest of the desktop is left alone. The picture changes when your day changes and
stays put when nothing happened.

```
   clients on this machine            zoe                        your desktop
   ────────────────────────           ───                        ────────────
   Cindy      (sqlite transcript)  ┐
   Codex      (rollout jsonl)      ├─▶ gather ─▶ brief ─▶ prompt ─▶ model ─▶ wallpaper
   Claude Code(jsonl transcript)   ┘      │        │         │        │
   long memory (project notes)  ───┘       │        │         │        └─ grok, then gpt-image-2
                                           │        │         └─ preset: style, character, layout
                                           │        └─ topic, mood, scene, props from memory
                                           └─ only the last hour, only what a human typed
```

## Why

A wallpaper is the one surface that is already there. Putting a picture on it that
knows what you were doing ten minutes ago is a cheap way to keep someone in the
room. Two rules make it work:

- **Tied to now.** The picture is about the direction and the mood of the last hour,
  never a screenshot of it. No dashboards, no UI, no status board.
- **Out of the way.** The subject occupies the bottom-right 15% of the frame. The
  other 85% stays quiet, which is where desktop icons live. A busy wallpaper is
  worse than no wallpaper.

## Requirements

macOS, Node 20.11+, `sqlite3` on PATH. No dependencies.

## Install

```sh
git clone https://github.com/<you>/zoe && cd zoe
node bin/zoe.mjs init          # writes ~/.zoe/config.json
node bin/zoe.mjs detect        # which clients were found on this machine
```

## Use

```sh
zoe detect                     # clients and the paths they were found at
zoe gather --hours 2           # what zoe can see right now
zoe brief                      # that, turned into a brief for one picture
zoe prompt                     # the exact text the image model receives
zoe models --import -          # remember the client's model list (see below)
zoe render                     # draw it (needs a provider, see below)
zoe show --image FILE          # put an image on every desktop and record it
zoe tick                       # the whole loop, standalone
zoe status                     # history, reuse pool, the props that accumulated
```

`brief.json` is the contract between the two halves. Read it if a picture comes out
wrong; it says which topic, mood, scene and props it drew from, and it keeps the
three lines of evidence behind that choice.

## Two ways to run it

**Agent mode.** A coding agent does the drawing, because it already has an image
tool that works. The agent runs `zoe brief` and `zoe prompt`, draws with its own
media tool, then runs `zoe show --image`. This is what `AGENTS.md` describes and
what a scheduled hourly job looks like. Nothing needs an API key.

**Standalone.** `zoe tick` does everything itself against an OpenAI-compatible
endpoint:

```json
{
  "providers": [
    { "id": "xai", "base_url": "https://api.x.ai/v1", "api_key_env": "XAI_API_KEY", "models": ["xai/grok-imagine-image-2.0"] },
    { "id": "openai", "base_url": "https://api.openai.com/v1", "api_key_env": "OPENAI_API_KEY", "models": ["openai/gpt-image-2"] }
  ]
}
```

## Models

`zoe models` walks the priority list and prints what it will actually use, plus
whatever it skipped to get there:

```
priority  : xai/grok-imagine-image-2.0  ->  openai/gpt-image-2
picked    : xai/grok-imagine-image-2.0
```

The default is grok first, `gpt-image-2` second. A model that is unreachable is
recorded in the run, never swapped in silently, and if the whole list is missing zoe
stops instead of drawing something else. A wildcard such as
`xai/grok-imagine-image*` follows the newest numbered variant in that family.

In agent mode the model list belongs to the client, so ask the agent for it once:

```sh
# the agent calls its own media list_models and pipes the result in
zoe models --import -    # {"models":[{"id":"xai/grok-imagine-image-2.0","provider_id":"xai"}, ...]}
```

## Presets

A preset is the art direction, and it is data, not code:

```json
{
  "style": "one paragraph of medium, era and what to never do",
  "character": "who is in the picture, described once, kept forever",
  "layout": "where the subject sits and how much stays open",
  "negative": ["3D render", "CGI", "text", "user interface"],
  "scenes":       [{ "id": "city-night", "desc": "..." }],
  "interactions": [{ "id": "B-care", "desc": "chin on both hands, looking up" }],
  "idle": "what she does when there is nothing to answer"
}
```

`presets/plain.json` is a neutral starting point. Put your own in
`~/.zoe/presets/` and point `preset` at it; it stays out of the repo.

Scenes and interactions rotate by least-recently-used, so a small list keeps
producing new pictures without ever repeating the last one.

## Continuity

`state.json` keeps a props ledger. Every prop that made it into a picture is
recorded, and the next brief puts the two most recent ones back on the desk. That is
the whole trick: the desk stays the same desk, and it slowly collects the things you
two worked on.

The reuse pool holds the last six hours of pictures. If the window is empty zoe
brings one back instead of inventing a new one — an empty hour should not cost an
image.

## Privacy

zoe reads local transcripts and sends one English paragraph to one image model. The
prompts and the briefs stay on disk. Nothing is uploaded anywhere else, and the repo
ships no personal data: your config lives in `~/.zoe/`, your pictures in the
`out_dir` you choose.

## Motion (planned, v0.2)

Three separate problems, with very different costs:

1. **Ambient loop** — waves, bamboo, rain, drifting cloud. The client already
   exposes video models with a documented body (duration 4–30s at 720p), and the
   same brief can describe the loop.
2. **Subject micro-motion** — hair moving, a leg crossing, a pen turning. This needs
   image-to-video with the still as the first frame, so the drawing you already like
   is the one that moves. Not verified against the client's guide yet.
3. **Getting it onto the desktop** — macOS cannot set a video as wallpaper. zoe will
   not pretend otherwise: the plan is a small window at `kCGDesktopWindowLevel`
   looping a local file, plus a plain mp4 you can hand to any wallpaper tool you
   already have.

The layout rule does not change. A loop only earns its keep if the 85% stays quiet.

## Tests

```sh
npm test
```

They cover the parts that are easy to get quietly wrong: the time window applied per
line rather than per file, the same sentence arriving from two clients, harness
scaffolding stripped out of transcripts, rotation that actually rotates, and a model
list that fails loudly instead of downgrading.

