// When paper was last up, and what it could say this hour. The agent decides whether she
// says anything and what; this only answers the two questions the skill asks before that
// decision: is the gap clear, and which note the hour fits.
export function paper(state, preset, now) {
  const history = state.history || [];
  const last = [...history].reverse().find((h) => h.note) || null;
  const gap = preset.note_gap_hours;
  const hours = last ? (now - last.at) / 3600e3 : null;
  const hour = new Date(now).getHours();
  return {
    last,
    hours,
    gap,
    quiet: !last || hours >= gap,
    hour,
    notes: preset.notes || [],
    fits: (preset.notes || []).filter((n) => !n.hours || n.hours.includes(hour)),
    poses: preset.notePoses || [],
    layout: preset.note_layout
  };
}
