---
name: zoe
description: Draw the hourly wallpaper and keep the room. Use for the hourly run, when asked to change the desktop picture, or when the picture on the desktop has gone stale.
---

# zoe

The code in this repo is the toolbox. It reads transcripts, holds the room's
inventory, checks a prompt and puts a file on the desktop. What a picture is about is
decided here, once an hour, from the data. Nothing under `src/` writes a prompt.

```
gather ──▶ room ──▶ prompt ──▶ draw ──▶ show ──▶ film ──▶  loop
 what      what the this        draws    puts     turns    plays it
 happened  room holds hour's text  it    it up    it into  after show
```

Run it from the repo: `node bin/zoe.mjs <command>`. Read `README.md` for what the
pieces are, `AGENTS.md` if you are changing the code.

## 1. What happened

```sh
node bin/zoe.mjs gather --hours 1 --json > /tmp/zoe-data.json
```

`items` is what was typed in the last hour, oldest first, with the project and the
client it came from. `memory` is the long memory: one line per project note, newest
first, each with a title, a description and a date.

Read both before deciding anything. The hour is usually one of: deep in a specific
piece of work, moving between several, stuck, or empty.

## 2. The room

```sh
node bin/zoe.mjs room
```

It prints what stands in the room, how long each thing has been there and how often it
has been drawn, what is old enough to leave, and which memories have no object yet.
This is the only place memories become furniture. Decide, write one small file, hand
it back:

```sh
cat > /tmp/zoe-room.json <<'JSON'
{"add": [{"memory": "<a title from the candidate list, exactly>", "thing": "<one English line>"}],
 "retire": ["k2"]}
JSON
node bin/zoe.mjs room --write /tmp/zoe-room.json
```

- At most one new object per run, and the room holds six. `zoe room` prints both numbers.
- `thing` is one line of English, 8 to 140 characters: what the object is, how it is
  worn, and where it stands. A postcard propped on the windowsill, a mug that has
  stopped matching its saucer, a ticket stub under a corner of the keyboard. Nothing
  is written on it, and no Chinese.
- Retire by id. A thing older than `room_keep_days` is a candidate, not an order: keep
  what still says something, drop what has gone quiet, and make room when you add.
- Everything in the room appears in every picture, so the prompt has to name each
  thing. The check refuses a prompt that dropped one.

An empty add list with an empty retire list is a fine answer for most hours.

## 3. The prompt

```sh
node bin/zoe.mjs prompt > /tmp/zoe-prompt.txt
```

That file is the text that drew the picture already on the desktop. Rewrite it for
this hour; do not start from a blank page and do not throw away what works.

- Keep, word for word: the style paragraph, the `Subject:` line, the resident-cats paragraph, the layout paragraph
  (or `note_layout` when she is holding paper), every word in `negative`, and the thing
  each keepsake is.
- Change: what she is doing, the view and the light behind her, the mood the hour
  carries, and where the keepsakes stand.
- Write it in English. The only Chinese in the whole picture is the line on the paper.

```sh
node bin/zoe.mjs prompt --write /tmp/zoe-prompt.txt            # no note this hour
node bin/zoe.mjs prompt --write /tmp/zoe-prompt.txt --note meal # note id from the preset
```

Before you write it, `node bin/zoe.mjs note` says whether paper is due: when it was last
up, whether `note_gap_hours` has passed, which notes this hour fits, and the
`note_layout` paragraph the check wants word for word. How she holds it is part of the
action below, so it comes out of the same summary.

The check refuses the write and names what is missing, so a prompt that lost the layout
or a keepsake never reaches the image model.

### Ways she says something

Paper is one mode of five. Two hours in a row should not speak the same way.

- **A note.** One line of Chinese, held so it reads at wallpaper size. Rare: only when
  nothing has held paper for `note_gap_hours`, and only when the hour earns it (a meal
  hour, the end of something shipped, a long night). `zoe note` prints the gap and the ids;
  the way she holds it belongs to this hour, like anything else she does.
- **A keepsake arriving.** A memory that becomes an object in the room, in this picture.
- **A keepsake leaving.** Something old goes; the next prompt stops naming it.
- **What she is doing.** Invented for this hour, out of the work itself. There is no list.
- **The view and the light.** One of `preset.scenes`, a place out of the memory or the hour,
  or the weather on its own terms.

### What she is doing

Write the hour down before you write her: one or two sentences of what the work actually
was and where it stands, out of `items` and `memory` together. That summary is what
`show --topic` records, and it is where her action comes from - one concrete thing, with
one real object from the hour in it. Nothing here is picked off a list and nothing is
rotated: she leans into the screen with the cursor stalled on the same line, holds two
cables apart and reads the one in her other hand, pushes back from a finished board with
her eyes still on it. The same summary decides how she holds the paper when this hour has
one.

What she is doing is a state, not the middle of a move: something she could hold for the six
seconds of the loop without changing. Nothing half-finished — a hand still travelling to
something, a cable on its way into its socket, anything on its way into or out of frame —
because the clip cannot finish it, and a video model asked to hold that frame drifts
instead.

Because generation uses image-to-image (`--ref last`) to preserve the room layout, windows,
and keepsakes, the prompt must say her pose is completely changed from the reference image.
Name the new pose in the same sentences that came from the hour summary. Do not pick from a
posture list, and do not keep the last picture's stance.

After eight in the evening, work the `evening` line of the preset in as well: the day is off, and
the picture knows it.

The keepsakes carry the memory. The desk carries this hour.

The cats are residents, not props. The `cats` paragraph fixes who they are; the hour
decides where they are and what they are doing. They may cross the room like she can,
while the desk and her working corner stay anchored in the bottom-right of the frame.

### The window

The view is most of the picture, so it carries the mood. Three ways to fill it, and the
hour picks:

- **The two cities.** `shanghai-lujiazui` or `hangzhou-river`: the working week seen from a
  high floor, wet streets below.
- **Somewhere else.** A place that turned up in `memory` or in this hour's `items` - the trip
  being planned, the city being discussed, the coast someone wants back. Name it in the
  view paragraph; it does not have to be in `preset.scenes`.
- **Weather on its own.** `bamboo-rain`, `sea-of-clouds`, rain on the glass, mist in the valley:
  no city and no place, just the hour's own air.

## 4. Draw it

```sh
node bin/zoe.mjs models   # the priority list, and which model it picks
node bin/zoe.mjs draw     # draws it, and prints the file it landed in
```

The shape is 16:9 - `size` in the config, 1792x1024, which the gateway hands back as 1280x720 -
and the model is the one `zoe models` reports. There is no second model and no quiet step
down: if the gateway refuses, the command fails and says which model it wanted and what
came back.

It reads the prompt out of `~/.zoe/prompt.txt` and draws from the picture the last hour left on the
desktop. That picture is the reference, so the room, the window view, the palette and the keepsakes
remain strictly consistent. But inside that stable room, her posture and action must distinctly
change according to the prompt so she does not remain frozen in the same standing stance hour
after hour.

```sh
node bin/zoe.mjs draw --ref none      # the first hour ever: nothing to come from
node bin/zoe.mjs draw --ref FILE      # from some other picture
node bin/zoe.mjs draw --prompt FILE   # some other text, for a one-off
```

Read the file it prints and hand it straight to `show`. The log line names the model that
actually drew it, which is the `--model` for the record.

## 5. Put it up

```sh
node bin/zoe.mjs show --image /tmp/zoe-1789658567040.jpg \
  --topic "what the hour was about" --scene shanghai-lujiazui \
  --pose "two cables held apart, reading the one in her other hand" \
  --note meal --model grok-imagine-image-2.0
```

The picture is a file on this disk, which is what `draw` and `film` print.

`show` sets every desktop, records the hour, ages the room, and stops any movie that was
playing, because the desktop holds one thing at a time. Pass `--note`, the scene id you used, and a
few words for what she was doing: the next hour reads them back from `zoe status`.

## 6. Let it move

A still that has just landed can become a loop:

```sh
node bin/zoe.mjs film                    # the still it just drew, moving
node bin/zoe.mjs loop --video ~/Pictures/zoe/loop_1789660476140.mp4
```

`film` takes that still as the first frame, sends the loop text of the preset with it to
the video model on the same proxy, and prints the clip. `loop` plays the clip on the
desktop, under the icons. The clip lands next to the wallpapers, as `loop_<timestamp>.mp4`.
`zoe motion` prints that text on its own if you want to read it, and `film --prompt FILE`
sends your own instead.

The two halves split the work: the still decides what she holds and how, and the clip keeps it
where it is. So the action in the still has to be one she can hold without moving.

The preset specifies a pure cinemagraph living photo: her posture, head, neck, face, and gaze
are strictly frozen with zero turning, zero nodding, and zero body movement, leaving only subtle
ambient micro-motions: gentle rise and fall of chest breathing, micro-fluttering of hair tips and
knit fabric edges, and outside window reflections or rain trickling down the glass. 

`film` automatically post-processes the clip with ffmpeg ping-pong (forward + reverse), guaranteeing
that the last frame connects back to the first frame with mathematical precision (F_end === F_start).
`DesktopMovie` plays this seamless clip natively under the desktop icons without destructive
cross-dissolve jumps.

## An empty hour

An empty hour should not cost a picture.

```sh
node bin/zoe.mjs reuse
```

If the pool is empty, draw `preset.idle`: her alone in the same room, doing nothing in
particular, and add no keepsake.

## Never

- Never use a model other than the one `zoe models` reports.
- Never write Chinese anywhere in the prompt except the line on the paper.
- Never write text, labels or numbers onto a keepsake or into the scene. The ban on
  `text` in `negative` steps aside only for the note picture.
- Never edit `~/.zoe/room.json` or `~/.zoe/prompt.txt` by hand. Both go through the CLI,
  which is where the checking happens.
- Never let a picture land without `show`: an unrecorded picture leaves the room and the
  reuse pool out of step with the desktop.

## Report

One line back to the user: what the hour was about, the file that landed, and whether it
moves.
