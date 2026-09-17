// The prompt for the hour is written by the agent, from the data and the preset. This
// is the short list it may not drop while doing that, and the only door the text goes
// through before it reaches an image model.
export function rules({ preset, room, note }) {
  return {
    style: preset.style,
    subject: 'Subject: ' + preset.character,
    layout: note ? preset.note_layout : preset.layout,
    negative: note ? preset.negative.filter((word) => word !== 'text') : preset.negative,
    things: (room?.symbols || []).map((s) => s.thing),
    note: note || null
  };
}

export function check({ text, preset, room, note }) {
  const r = rules({ preset, room, note });
  const missing = [];

  if (!text.includes(r.style)) missing.push('the style paragraph');
  if (!text.includes(r.subject)) missing.push('the subject line');
  if (!text.includes(r.layout)) missing.push(note ? 'the layout for a note picture' : 'the layout paragraph');
  for (const word of r.negative) if (!text.includes(word)) missing.push('the ban on ' + word);
  for (const thing of r.things) if (!text.includes(thing)) missing.push('the keepsake: ' + thing);
  if (r.note && !text.includes(r.note)) missing.push('the note she is holding: ' + r.note);
  if (text.length > 4000) missing.push('the prompt is ' + text.length + ' characters long, the limit is 4000');

  if (missing.length) throw new Error('this prompt cannot be used, it is missing:' + '\n  ' + missing.join('\n  '));
  return text;
}
