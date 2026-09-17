const short = (text, max) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('，'), cut.lastIndexOf('、'), cut.lastIndexOf('。'));
  return (at > max * 0.4 ? cut.slice(0, at) : cut).replace(/[，,、。;；\s]+$/, '');
};

// Turns a brief into the English text the image model actually receives.
export function compose({ brief, preset }) {
  if (brief.idle) throw new Error('compose: idle brief has nothing to draw');

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
    preset.layout,
    `No watermark, no logo, no user interface, no screen recording. Tiny handwritten notes on paper are fine.`,
    preset.negative.length ? `Avoid: ${preset.negative.join(', ')}.` : null
  ];

  return lines.filter(Boolean).join('\n');
}
