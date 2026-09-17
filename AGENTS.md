# Working on zoe

zoe is a toolbox with an agent on top of it. Keep the split clean: the code reads
data, holds the room, checks a prompt and touches the desktop. What a picture is
about lives in `SKILL.md`, in prose, and is decided by the agent each hour.

- No dependencies. Node stdlib, `sqlite3`, `osascript`. Adding a package needs a
  reason that would survive in the README.
- No silent fallbacks. If a model, a file or a client is missing, say so and stop.
  A run that quietly used something else is worse than a run that failed.
- Every module stays readable on one screen. `src/sources.mjs` is the biggest one
  and that is the ceiling.
- Nothing under `src/` writes prose. `src/check.mjs` may refuse a prompt; it never
  composes one. If you are typing an English sentence into a module that ends up in
  front of an image model, it belongs in a preset or in `SKILL.md`.
- The two files the agent owns, `~/.zoe/room.json` and `~/.zoe/prompt.txt`, are written
  only through `zoe room --write` and `zoe prompt --write`, which is where the guards are.
- `npm test` before a commit. The tests cover behaviour that is easy to break without
  noticing: the time window, dedup between clients, rotation, the model list that fails
  loudly, the room's guards, and the prompt check.

## The commands

```
init / detect / models [--import -]
gather [--hours N] [--json]        data only: what happened, plus the long memory
room [--write FILE]                the keepsakes, in and out
prompt [--write FILE] [--note ID]  the text in use, and the only door a new one uses
show --image F [--topic T] [--scene ID] [--pose ID] [--note ID] [--model M]
reuse / motion / loop / status
```

## The hourly job

The schedule runs an agent in this repo with `SKILL.md` as the instructions. The prompt
is short on purpose; everything else belongs in the skill, where it can be read and
changed without touching a schedule:

```
You are drawing the hourly wallpaper for this machine. Follow SKILL.md in this repo,
start to finish, and report one line at the end.
```

The agent needs a media tool that can draw an image, and one that can turn an image
into a short video if the hour earns motion. Resolve a drawn image to a real local path
before `zoe show` (`resolve_local_path` in Cindy).

## Motion

`zoe motion` prints the text for the video model. Submit it as image-to-video with the
still as the first frame, using the managed address the still came back at:

```json
{ "content": [
  { "type": "text", "text": "<the text from zoe motion>" },
  { "type": "image_url", "image_url": { "url": "cindy-media://blobs/....jpg" }, "role": "first_frame" }
], "generate_audio": false }
```

A local path is rejected upstream. If you only have the file, draw the still again.
