# Working on zoe

zoe is a small tool with a clear contract. Keep it that way.

- No dependencies. Node stdlib, `sqlite3`, `osascript`. Adding a package needs a
  reason that would survive in the README.
- No silent fallbacks. If a model, a file or a client is missing, say so and stop.
  A run that quietly used something else is worse than a run that failed.
- Every module stays readable on one screen. `src/sources.mjs` is the biggest one
  and that is the ceiling.
- `npm test` before a commit. The tests are about behaviour that is easy to break
  without noticing.

## Drawing a picture (agent mode)

```sh
node bin/zoe.mjs brief --hours 1        # writes ~/.zoe/brief.json
node bin/zoe.mjs prompt > /tmp/p.txt    # the exact text for the image model
```

Then draw it with your own image tool, at the model `zoe models` reports, and hand
the file back:

```sh
node bin/zoe.mjs show --image /path/to/drawn.jpg --model <model id you used>
```

If the brief is idle, do not draw. `zoe tick` shows the branch to follow: reuse
something from the pool, or use `preset.idle` for a quiet one.

Resolve the drawn image to a real local path first. Media tools that return a blob
URL usually have a way to resolve it (`resolve_local_path` in Cindy).

## Motion

To turn the picture that is on the desktop into a loop:

```sh
node bin/zoe.mjs motion                 # the text for the video model
node bin/zoe.mjs loop --video FILE      # play it, desktop layer, under the icons
node bin/zoe.mjs loop --stop            # take it off again
```

Submit it as image-to-video, the still as the first frame:

```json
{ "content": [
  { "type": "text", "text": "<the text from zoe motion>" },
  { "type": "image_url", "image_url": { "url": "cindy-media://blobs/....jpg" }, "role": "first_frame" }
], "generate_audio": false }
```

The first frame must be the managed address the still was generated at, not a local
path; a path is rejected upstream. If you only have the file, draw the still again.

## Hourly job

A schedule that runs this every hour, in a long-lived session, working directory
this repo, no worktree:

```
You are drawing the hourly wallpaper for this machine.

1. node bin/zoe.mjs brief --hours 1
2. If it is idle, do not invent a topic:
     node bin/zoe.mjs reuse          bring one back from the pool, costs nothing
     if the pool is empty: node bin/zoe.mjs prompt --idle, and draw that
3. node bin/zoe.mjs prompt           the exact text for the image model
4. node bin/zoe.mjs models           the model and provider to use. Do not pick another.
5. Draw that prompt with your media tool at aspect ratio 3:2, resolve the result to a
   local path, then: node bin/zoe.mjs show --image <path> --model <model id>
6. If the hour had real work in it (step 2 was not idle), let it move, as described
   under Motion above, then: node bin/zoe.mjs loop --video <path>
7. Report one line: the topic, the model, the file that landed, and whether it moves.
```

Some briefs carry a `note`: one line she holds up on paper. The prompt already
asks for it and the note picture brings its own layout, so there is nothing extra to do
beyond drawing it well.

Never fall back to another model. If the one `zoe models` picked is unavailable, stop and say
so; a run that quietly drew with something else is worse than a failed run.

Keep the prompt out of the schedule. Everything that decides what to draw lives in
the repo, where it can be tested.

