# zoe

A companion that talks to you through your wallpaper.

zoe is not a wallpaper app. Every hour it reads what you actually did in the last
hour — in Cindy, in Codex, in Claude Code — and answers it with one picture. Same
character, same hand, same window. The subject sits in the corner of the screen and
the rest of the desktop is left alone. The picture changes when your day changes and
stays put when nothing happened.

The room fills up as the two of you go: a memory becomes an object on the shelf, stays
in every picture for a few weeks, and then leaves.

```
  clients on this machine           zoe                       your desktop
  ────────────────────────          ───                       ────────────
  Cindy      (sqlite transcript) ┐
  Codex      (rollout jsonl)     ├─▶ gather ─▶ room ─▶ prompt ─▶ image ─▶ wallpaper
  Claude Code(jsonl transcript)  ┘      │        │        │         │
  long memory (project notes) ───┘      │        │        │         └─ grok, then gpt-image-2
                                        │        │        └─ the agent's text, checked
                                        │        └─ a memory becomes an object
                                        └─ only the last hour, only what a human typed
```

Half of zoe is code and half of it is a prompt. The code reads transcripts, keeps the
room's inventory, checks a prompt and puts a file on the desktop. What any one picture
is about is written by an agent, once an hour, following [`SKILL.md`](SKILL.md).

## Why

A wallpaper is the one surface that is already there. Putting a picture on it that
knows what you were doing ten minutes ago is a cheap way to keep someone in the room.
Two rules make it work:

- **Tied to now.** The picture is about the direction and the mood of the last hour,
  never a screenshot of it. No dashboards, no UI, no status board.
- **Out of the way.** The subject occupies the bottom-right 15% of the frame. The
  other 85% stays quiet, which is where desktop icons live. A busy wallpaper is worse
  than no wallpaper.

## Requirements

macOS, Node 20.11+, `sqlite3` on PATH. No dependencies. An agent that can draw images
(Claude Code, Codex or Cindy) to run the hour.

## Install

```sh
git clone https://github.com/<you>/zoe && cd zoe
node bin/zoe.mjs init          # writes ~/.zoe/config.json
node bin/zoe.mjs detect        # which clients were found on this machine
```

Then ask your agent to follow `SKILL.md`, or put the hourly job on a schedule:

```
You are drawing the hourly wallpaper for this machine. Follow SKILL.md in this repo,
start to finish, and report one line at the end.
```

## Use

```sh
zoe detect                        # clients and the paths they were found at
zoe gather --hours 2 [--json]     # what this hour looks like, nothing decided
zoe room                          # what stands in the room, and what it could take
zoe room --write FILE             # add or retire keepsakes
zoe prompt                        # the text the last hour drew with
zoe prompt --write FILE           # hand over a new one: checked, then stored
zoe models [--import -]           # the model priority list, and which one wins
zoe show --image FILE|ADDR [--topic T] [--scene ID] [--pose ID] [--note ID] [--model M]
zoe reuse                         # bring a wallpaper back from the pool, costs nothing
zoe motion                        # the text that turns the picture into a loop
zoe loop --video FILE|ADDR       play a movie on the desktop layer instead of a still
zoe status                        # the last hours, the pool, the desktop
```

The two files that carry between hours are written only through these commands:
`~/.zoe/room.json` by `zoe room --write`, `~/.zoe/prompt.txt` by `zoe prompt --write`.
That is where the guards are.

## The room

`~/.zoe/room.json` is the keepsakes: one memory per object, with what it looks like,
when it arrived and how often it has been drawn.

```json
{ "symbols": [
  { "id": "k1",
    "memory": { "title": "优惠券分类规范", "at": 1789636992000, "text": "..." },
    "thing": "a postcard propped on the windowsill, the corners soft from handling",
    "added_at": 1789636992000, "seen_at": 1789636992000, "shown": 3 } ] }
```

The agent decides what enters and what leaves, from the candidate list `zoe room`
prints and from the age of what is already there. The guards are in `src/room.mjs`:
the memory has to be one the agent was shown, the thing has to be one line of English
(8–140 characters, no Chinese), one new object per run, six in the room at a time, and
an object older than `room_keep_days` is only a candidate for leaving.

Every keepsake is in every picture, so the memory stays in the room long after the hour
that produced it. That is the difference between a memory and a note: paper lasts an
hour, an object lasts weeks.

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
  "room": "where a kept thing can stand: the shelf, the windowsill, the wall",
  "notes":        [{ "id": "meal", "line": "该吃饭了", "hours": [11, 12, 13] }],
  "note_gap_hours": 4,
  "notePoses":    [{ "id": "N-hold", "desc": "holding the paper out toward the camera" }],
  "note_layout":  "where the paper sits so it reads, and what stays open",
  "idle": "what she does when there is nothing to answer"
}
```

`presets/plain.json` is a neutral starting point. Put your own in `~/.zoe/presets/` and
point `preset` at it; it stays out of the repo.

Scenes and interactions are lists to choose from, not a rotation the code enforces: the
agent picks by least-recently-used, checks `zoe status` so it does not repeat the last
hour, and says which ids it used in `zoe show`.

## The prompt

The prompt for the hour is a rewrite of the prompt that drew the last one. `zoe prompt`
prints it; the agent edits it and hands it back through `zoe prompt --write`.

`src/check.mjs` is the door it goes through. It refuses a prompt that dropped the style
paragraph, the `Subject:` line, the layout paragraph (or `note_layout` for a note
picture), any word in `negative`, the description of any keepsake that is in the room,
or the Chinese line when a note was asked for. It also stops a prompt longer than 4000
characters. Nothing is written if the check fails, so a careless hour cannot quietly
drop the rules the whole series depends on.

## The note

Every so often she holds up a piece of paper with a line on it: 该吃饭了 at a meal hour,
该睡了 late at night, 干得漂亮 when the hour ended in something shipped. It is the only
writing zoe ever puts in a picture, and the ban on `text` in `negative` steps aside for
that one picture because the writing is the whole point of it.

The note is one of several ways the hour can answer — a keepsake arriving, a keepsake
leaving, a different pose, a different view. It is the loudest of them, so it stays
rare: nothing has held paper for `note_gap_hours`, and the hour has to earn it.

`note_layout` brings the paper out at arm's length toward the camera so the characters
still read at wallpaper size, while the rest of the frame stays open for icons. A note
picture that does not name the line it is holding does not pass the check.

## Models

`zoe models` walks the priority list and prints what it will actually use, plus
whatever it skipped to get there:

```
priority  : xai/grok-imagine-image-2.0  ->  openai/gpt-image-2
picked    : xai/grok-imagine-image-2.0
```

The default is grok first, `gpt-image-2` second. The list belongs to the client, so
import it once and zoe stops guessing:

```sh
# the agent calls its own media list_models and pipes the result in
zoe models --import -    # {"models":[{"id":"xai/grok-imagine-image-2.0","provider_id":"xai"}, ...]}
```

A wildcard such as `xai/grok-imagine-image*` follows the newest numbered variant in
that family. If none of them are available zoe says so and the run stops; drawing with
a model nobody asked for is worse than drawing nothing. You can also list the models in
`providers` in the config instead of importing the client's list.

## Setting the wallpaper

`zoe show --image` takes a path or the managed `cindy-media://` address a media
tool handed back; for a managed address the bytes come from the client's own media
folder. It writes a fresh timestamped file, because macOS caches a wallpaper by path, then
asks every desktop what it is actually showing. macOS drops a desktop change now and then
— on a two-display setup one screen can quietly keep the old picture — so a desktop that
missed gets set again, and one that still refuses is an error rather than a half-done job
that reports success.

## Motion

A still picture cannot move, so the same picture becomes a loop: the still you already
like is the first frame, and only the small things change.

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

## Privacy

zoe reads local transcripts and sends one English paragraph to one image model. The
prompts and the room stay on disk. Nothing is uploaded anywhere else, and the repo
ships no personal data: your config lives in `~/.zoe/`, your pictures in the `out_dir`
you choose.

## Tests

```sh
npm test
```

They cover the parts that are easy to get quietly wrong: the time window applied per
line rather than per file, the same sentence arriving from two clients, harness
scaffolding stripped out of transcripts, rotation that actually rotates, a model list
that fails loudly instead of downgrading, the room's guards, and a prompt check that
names what went missing. There is no test for taste: that lives in `SKILL.md`.
