import { rotate } from './state.mjs';

const DEFAULT_GAP_HOURS = 4;

// The one time zoe says something in words: a small note she holds up. It stays
// rare on purpose, so a note only shows up when the hour or the mood asks for it
// and never twice inside the gap. Everything else about the picture is drawn as
// usual; she just happens to be holding this.
export function pickNote({ notes, now, history, mood, gapHours }) {
  if (!notes?.length) return null;
  const said = (history || []).filter((h) => h.note);
  const last = said[said.length - 1];
  const gap = (gapHours || DEFAULT_GAP_HOURS) * 3600e3;
  if (last && now - last.at < gap) return null;

  const hour = new Date(now).getHours();
  const clock = notes.filter((n) => (n.hours || []).includes(hour));
  const fits = clock.length ? clock : notes.filter((n) => n.mood && String(mood).includes(n.mood));
  return fits.length ? rotate(fits, history || [], 'note') : null;
}
