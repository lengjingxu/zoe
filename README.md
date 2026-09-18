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
  long memory (project notes) ───┘      │        │        │         └─ the gateway: grok, then gpt-image-2
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

macOS, Node 20.11+, `sqlite3` on PATH. No dependencies. An OpenAI-shaped image and
video gateway to draw through, and an agent (Claude Code, Codex or Cindy) to run the hour.

## Install

```sh
git clone https://github.com/<you>/zoe && cd zoe
node bin/zoe.mjs init          # writes ~/.zoe/config.json
node bin/zoe.mjs detect        # which clients were found on this machine
node bin/zoe.mjs models        # the priority list, and which model it picks
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
zoe models                        # the model priority list, and which one wins
zoe last                          # the picture the last hour left, to draw from
zoe draw [--ref FILE|none]        # the gateway draws this hour, prints the file
zoe film [--first-frame FILE]     # the gateway turns that still into a loop
zoe show --image FILE [--topic T] [--scene ID] [--pose WORDS] [--note ID] [--model M]
zoe reuse                         # bring a wallpaper back from the pool, costs nothing
zoe motion                        # the text that turns the picture into a loop
zoe loop --video FILE             # play a movie on the desktop layer instead of a still
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
  "scenes":       [{ "id": "shanghai-lujiazui", "desc": "..." }],
  "evening": "what changes about her after eight at night",
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

Scenes are a list to choose from, not a rotation the code enforces: the agent picks by
least-recently-used, checks `zoe status` so it does not repeat the last hour, and says
which id it used in `zoe show`. The view can also be a place that came up in the memory,
named in the prompt without being in the list at all.

What she is doing is not a list. It is invented for the hour out of the work itself, and the
hour is told in `items`; the desk carries this hour, the keepsakes carry the memory.

The style paragraph is the look, and it is worth writing literally. Naming the works behind
it - City Hunter, Cat's Eye - moved the subject and the mood and left the line alone. What
moved the line was saying how it is drawn: fine even ink with the outline no heavier than the
interior lines, flat cel tones, hair as a few solid masses with crisp highlight bands, adult
proportions, backgrounds painted in one-point perspective. The same prompt in English and in
Chinese produced the same picture.

## The prompt

The prompt for the hour is a rewrite of the prompt that drew the last one. `zoe prompt`
prints it; the agent edits it and hands it back through `zoe prompt --write`.

`src/check.mjs` is the door it goes through. It refuses a prompt that dropped the style
paragraph, the `Subject:` line, the layout paragraph (or `note_layout` for a note
picture), any word in `negative`, the description of any keepsake that is in the room,
or the Chinese line when a note was asked for. It also stops a prompt longer than 4000
characters. Nothing is written if the check fails, so a careless hour cannot quietly
drop the rules the whole series depends on.

## One hour to the next

An hour is a step, not a new picture. `zoe draw` sends the file the last hour left on the
desktop as the reference, so the room, the hand, the palette and where everything stands
come back the way they were, and only what the prompt names moves. The view outside, what
stands in the room and what she is doing are the three things an hour is allowed to
change. The text for it comes from `~/.zoe/prompt.txt`, which the agent rewrites each
hour out of the previous one instead of starting from a blank page.

The loop is the same idea with a smaller budget of movement: breathing, blinking, hair and
cloth drifting, the light easing a shade, and no action at all. A single recognizable
action is what makes a loop feel like a loop.

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

Every picture comes from one gateway, named in `~/.zoe/config.json`. `zoe models` walks
the priority list and prints what it will use, and what it skipped to get there:

```
priority  : grok-imagine-image-2.0  ->  gpt-image-2
video     : grok-imagine-video-1.5  ->  grok-imagine-video-1.5-preview
providers : proxy (5 models)
available : grok-imagine-image-2.0, gpt-image-2, grok-imagine-video-1.5, ...
picked    : grok-imagine-image-2.0
```

```json
{ "models": {
    "priority": ["grok-imagine-image-2.0", "gpt-image-2"],
    "video_priority": ["grok-imagine-video-1.5", "grok-imagine-video-1.5-preview"] },
  "providers": [
    { "id": "proxy",
      "base_url": "http://your-gateway:8080/v1",
      "api_key_env": "GPT_IMAGE_API_KEY",
      "models": ["grok-imagine-image-2.0", "gpt-image-2",
                 "grok-imagine-video-1.5", "grok-imagine-video-1.5-preview"] } ] }
```

The gateway is OpenAI-shaped: `/images/generations`, `/images/edits`,
`/videos/generations` and `/videos/{request_id}`. The key is read from the environment
variable the provider names and never from a file; an empty variable stops the run and
says which one it wanted. The ids under `models` are the ids the gateway serves, so list
them once (`curl $BASE/models`) and paste them in.

A wildcard such as `grok-imagine-image*` follows the newest numbered variant of that
family. If nothing on the list is there, zoe says so and stops; drawing with a model
nobody asked for is worse than drawing nothing.

### What a gateway actually serves

The list a provider returns is not the list it draws with. One gateway tested here offered
nineteen image ids and accepted five on `/images/generations`: `gpt-image-1.5`, `gpt-image-2`,
`grok-imagine-image`, `grok-imagine-image-quality` and `grok-imagine-image-2.0`. The rest came
back `HTTP 400` with those five named in the message, which is the quickest way to find the
real list.

Size is worth checking per model rather than per gateway. Asked for 1792x1024, the three grok
models always answered 1280x720, the 16:9 the desktop wants, while `gpt-image-1.5` answered
1672x941 once and 1536x1024 twice, which is 3:2 and gets cropped. The grok models draw in ten
to thirty-five seconds; the two gpt models take fifty to a hundred.

Both gpt models take `/images/edits`, so either can draw the next hour from the last one.

## Setting the wallpaper

The picture is 16:9. `size` in the config asks the gateway for 1792x1024 and it hands back
1280x720; 3:2 is one line away if you prefer a taller frame.

`zoe show --image` takes a file on this disk, which is what `zoe draw` and `zoe film`
print. It writes a fresh timestamped file, because macOS caches a wallpaper by path, then
asks every desktop what it is actually showing. macOS drops a desktop change now and then
— on a two-display setup one screen can quietly keep the old picture — so a desktop that
missed gets set again, and one that still refuses is an error rather than a half-done job
that reports success.

## Motion

A still picture cannot move, so the same picture becomes a loop: the still you already
like is the first frame, and only the small things change.

```sh
zoe motion                          # the exact text the video model receives
zoe film                            # that text plus the picture on the desktop now
zoe loop --video ~/Pictures/zoe/loop_....mp4   # play it, under the icons
zoe loop --stop                     # take it off again
```

`zoe motion` The first frame goes up as a data URL, so the body of the request is the picture. Past a
megabyte on disk the still is shrunk to 1280 wide before it is encoded, because the
gateway refuses a body that big; a still under that goes up untouched.

prints the loop from the preset: the locked-off camera, the ban on action and
the hold. `zoe film` pairs that text with the still, sends both, and polls until the
clip is ready. The length and the size travel as fields on the request, not as words in
the prompt: `--seconds` (6 by default) and `--resolution` (720p by default, which
comes back 1168x768).

### Getting a movie onto the desktop

macOS has no supported way to set a video as wallpaper. zoe does not pretend
otherwise: `zoe loop` builds a small Swift window (`native/DesktopMovie.swift`,
compiled once into `~/.zoe/bin/`) pinned to `kCGDesktopWindowLevel` — above the
wallpaper, below the icons, click-through, one window per display — and loops the file
with `AVPlayerLooper`. `zoe show --image` stops the movie, because the desktop holds
one thing at a time.

### What a loop costs

Measured here on one still of 1248x832 and the loop made from it:

- **It is softer than the still.** At the default resolution the clip came back 672x448;
  at `--resolution 720p` it came back 1168x768. On a retina display the small one is a
  visible step down from the picture it was made from.
- **The seam is close, not perfect.** Last frame against first frame lands near 26 dB, so
  the jump back to the start is visible if you are looking for it. The prompt asks for a
  seamless loop and the model approximates it; nobody guarantees it.
- **The composition holds.** The first frame against the still it came from is around
  29 dB, and the subject stays where the layout rule put her.

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
