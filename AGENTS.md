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
init / detect / models
gather [--hours N] [--json]        data only: what happened, plus the long memory
room [--write FILE]                the keepsakes, in and out
prompt [--write FILE] [--note ID]  the text in use, and the only door a new one uses
draw [--ref FILE|none] [--prompt FILE] [--out FILE]      the proxy draws the hour
film [--first-frame FILE] [--prompt FILE] [--seconds N] [--out FILE]   the proxy moves it
show --image FILE [--topic T] [--scene ID] [--pose WORDS] [--note ID] [--model M]
last                               the last picture, as the reference for this hour
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

The agent needs no media tool of its own. `zoe draw` and `zoe film` talk to the gateway
named in `~/.zoe/config.json`, and both leave a local file behind. `src/proxy.mjs` is the
only file here that speaks to a model.

## Drawing

How to draw is not up to the agent either: the model comes from the priority list in the
config, the picture to come from is the last hour's, and the text is `~/.zoe/prompt.txt`.
`zoe draw` joins the three and writes one file.

```
POST {base}/images/generations   the prompt alone, on the first hour
POST {base}/images/edits         the same, as multipart, with the previous picture as `image`
```

A provider in the config is an OpenAI-shaped base URL, the name of the environment
variable that holds its key, and the model ids it serves. The key is read from that
variable and nowhere else; if it is empty, `endpoint()` stops the run and names it. Nothing
here picks a second model to fall back on.

## Motion

`zoe film` sends the text from `zoe motion` and the still to `POST {base}/videos/generations`,
then polls `GET {base}/videos/{request_id}` every ten seconds until the job is done, and writes
the mp4 to a local file. The still goes up as a data URL, so there is no address to
resolve and no client in the middle.

A local path is what `loop` wants, and a local path is what `film` prints.
