---
name: zoe
description: Draw the hourly wallpaper and keep the room. Use for the hourly run, when asked to change the desktop picture, or when the picture on the desktop has gone stale.
---

# zoe

The code in this repo is the toolbox. It reads transcripts, holds the room's
inventory, checks a prompt and puts a file on the desktop. What a picture is about is
decided here, once an hour, from the data. Nothing under `src/` writes a prompt.

```
gather ──▶ room ────▶ prompt ───▶ image ───▶ (motion) ───▶ show
 what      what the    this         draw       let it       put it up
 happened  room holds  hour's text  it         move         and remember
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

- Keep, word for word: the style paragraph, the `Subject:` line, the layout paragraph
  (or `note_layout` when she is holding paper), every word in `negative`, and the thing
  each keepsake is.
- Change: what she is doing, the view and the light behind her, the mood the hour
  carries, and where the keepsakes stand.
- Write it in English. The only Chinese in the whole picture is the line on the paper.

```sh
node bin/zoe.mjs prompt --write /tmp/zoe-prompt.txt            # no note this hour
node bin/zoe.mjs prompt --write /tmp/zoe-prompt.txt --note meal # note id from the preset
```

The check refuses the write and names what is missing, so a prompt that lost the layout
or a keepsake never reaches the image model.

### Ways she says something

Paper is one mode of five. Two hours in a row should not speak the same way.

- **A note.** One line of Chinese, held so it reads at wallpaper size. Rare: only when
  nothing has held paper for `note_gap_hours`, and only when the hour earns it (a meal
  hour, the end of something shipped, a long night). Use the id from `preset.notes`.
- **A keepsake arriving.** A memory that becomes an object in the room, in this picture.
- **A keepsake leaving.** Something old goes; the next prompt stops naming it.
- **The pose.** One of `preset.interactions`: what she is doing while you work.
- **The view and the light.** One of `preset.scenes`, or the hour's own weather.

## 4. Draw it

```sh
node bin/zoe.mjs models   # the one model you may use
node bin/zoe.mjs last     # the address the last picture came back at
```

Aspect ratio 3:2, with the model `zoe models` reports and no other.

When `zoe last` prints an address, draw with `image.edit` and hand that address
in as the reference image. The picture already on the desktop is the reference, so the
room, the hand, the palette and where everything stands come back as they were, and only
the things the prompt names move: the view outside, what stands in the room, and what she
is doing. Write the prompt that way, naming what stays and what changes, and keep the
changes small — an hour apart is an hour, not a season.

When it prints nothing (the first hour ever, or a picture that never came back at a
managed address), generate from the prompt alone.

The exact body is in `AGENTS.md`. If the model fails, say so and stop: a run that
quietly drew with a different model is worse than a run that drew nothing.

## 5. Let it move

A still that has just landed can become a loop. `node bin/zoe.mjs motion`
prints the text for the video model; submit it as image-to-video with the still as the
first frame, the managed `cindy-media://` address the still came back at, not a local
path. Then:

```sh
node bin/zoe.mjs loop --video cindy-media://blobs/....mp4
```

A path or a managed address, the same as `show`.

That text asks for the smallest motion there is — breathing, blinking, hair and cloth
drifting, the light easing a shade — and for no action at all: nobody stands, turns,
crosses their legs or lifts a cup, and nothing new appears. Keep it that way. One
recognizable action is what makes a loop feel like a loop.

## 6. Put it up

```sh
node bin/zoe.mjs show --image cindy-media://blobs/....jpg \
  --topic "what the hour was about" --scene window-rain --pose B-care \
  --note meal --model xai/grok-imagine-image-2.0
```

--image takes either a path or the managed address the media tool handed back; for a
managed address zoe reads the bytes out of the client's own media folder.

`show` sets every desktop, records the hour, ages the room, and stops any movie that was
playing, because the desktop holds one thing at a time. Pass `--note` and the scene and
pose ids you actually used: the next hour reads them back from `zoe status`.

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
