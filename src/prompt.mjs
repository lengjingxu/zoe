const short = (text, max) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('，'), cut.lastIndexOf('、'), cut.lastIndexOf('。'));
  return (at > max * 0.4 ? cut.slice(0, at) : cut).replace(/[，,、。;；\s]+$/, '');
};

// Turns a brief into the English text the image model actually receives.
export function compose({ brief, preset }) {
  if (brief.idle) throw new Error('compose: idle brief has nothing to draw');

  // The note is the one picture that wants text, so the blanket ban steps aside
  // for that single picture. Nothing else about the direction changes.
  const negative = brief.note ? preset.negative.filter((word) => word !== 'text') : preset.negative;

  const lines = [
    preset.style,
    `Subject: ${preset.character}`,
    brief.quiet ? null : `They are in the middle of this right now: ${short(brief.topic, 44)}`,
    `Window outside: ${brief.scene.desc}`,
    `She is ${brief.interaction.desc}`,
    brief.props.length
      ? `On the desk, as small physical props she can touch: ${brief.props.map((p) => short(p, 18)).join(', ')}`
      : null,
    brief.desk.length ? `Already on the desk from earlier days, keep them there: ${brief.desk.join(', ')}` : null,
    brief.wish ? `Through the window, far away and barely visible: ${brief.wish}` : null,
    `Mood: ${brief.mood}. Time of day: ${brief.slot}. This is what she and the viewer are in the middle of.`,
    brief.note ? 'She has stopped what she was doing to tell us something, and she is close enough to read it.' : null,
    brief.note
      ? 'The message is written on it in her own hand, in black ink, in Chinese characters, and it is the one thing we are meant to read, exactly this and nothing more: ' +
        brief.note.line
      : null,
    brief.note ? 'The paper, her hand and her arm stay inside the same small corner of the frame as the rest of her.' : null,
    brief.note ? preset.note_layout : preset.layout,
    'No watermark, no logo, no user interface, no screen recording.',
    negative.length ? `Avoid: ${negative.join(', ')}.` : null
  ];

  return lines.filter(Boolean).join('\n');
}
