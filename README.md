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
zoe motion                     # the text that turns the picture on screen into a loop
zoe loop --video FILE          # play a movie on the desktop layer instead of a still
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

## Motion

A still picture cannot move, so the same picture becomes a loop: the still you
already like is the first frame, and only the small things change.

```sh
zoe motion                     # the exact text the video model receives
zoe loop --video clip.mp4      # play it on the desktop, under the icons
zoe loop --stop                # take it off again
```

`zoe motion` prints the loop from the preset plus the model parameters, which is the
whole body the video model needs:

```
Locked-off camera, one continuous take, no cuts, and the last frame lands back on
the first so the loop has no seam. Only small motion ...
The camera does not move and the framing never changes ...
--duration 6 --resolution 720p
```

In agent mode the agent pairs that text with the still as the first frame and submits
it — the body is in `AGENTS.md`. The first frame has to be a managed address from the
same client that draws the video; a local path is rejected upstream, which is how this
was found.

### Getting a movie onto the desktop

macOS has no supported way to set a video as wallpaper. zoe does not pretend
otherwise: `zoe loop` builds a small Swift window (`native/DesktopMovie.swift`,
compiled once into `~/.zoe/bin/`) pinned to `kCGDesktopWindowLevel` — above the
wallpaper, below the icons, click-through, one window per display — and loops the file
with `AVPlayerLooper`. `zoe show --image` stops the movie, because the desktop holds
one thing at a time.

### What a loop costs

Measured on one 3:2 still at `--duration 6 --resolution 720p`:

- **It is softer than the still.** The clip came back 1178x786. On a retina display that
  is a real step down from the picture it was made from, and 720p is the top setting the
  model offers. The still is the sharp version of the same image; the loop is the moving one.
- **The seam is close, not perfect.** Last frame against first frame lands around 30 dB, so
  the jump back to the start is visible if you are looking for it. The prompt asks for a
  seamless loop and the model approximates it; nobody guarantees it.
- **The composition holds.** The first frame against the still it came from is around 37 dB,
  and the subject stays where the layout rule put her.

A movie is not free. It costs GPU and battery on a large display; if the fan matters
more than the drift, stay with the stills.

## Tests

```sh
npm test
```

They cover the parts that are easy to get quietly wrong: the time window applied per
line rather than per file, the same sentence arriving from two clients, harness
scaffolding stripped out of transcripts, rotation that actually rotates, and a model
list that fails loudly instead of downgrading. The motion tests cover the loop text and
the player record: a pid left behind by a dead player must not look like a movie that is
still up, and stopping must really stop it.

