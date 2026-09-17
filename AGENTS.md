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

A schedule that runs this every hour, in a long-lived session, one working
directory, no worktree:

```
You are drawing the hourly wallpaper for this machine.

1. node bin/zoe.mjs brief --hours 1
2. If it is idle: node bin/zoe.mjs tick handles reuse. Do not invent a topic.
3. node bin/zoe.mjs prompt
4. Draw that prompt with the media tool, at the model from node bin/zoe.mjs models.
   Aspect ratio 3:2.
5. Resolve the result to a local path, then:
   node bin/zoe.mjs show --image <path> --model <model>
6. Report one line: the topic, the model, and the file that landed.
```

Keep the prompt out of the schedule. Everything that decides what to draw lives in
the repo, where it can be tested.

