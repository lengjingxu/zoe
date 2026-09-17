const HOLD =
  'The camera does not move and the framing never changes. She stays the same size, in the same ' +
  'place, in the same drawing as the source frame, and the open area stays open from the first ' +
  'frame to the last.';

// The wallpaper as a loop: the picture that is already up becomes the first frame and
// only the small motions change, so the desktop keeps its layout.
export function animate({ preset }) {
  if (!preset.motion) throw new Error('preset ' + preset.name + ' has no motion block, nothing to animate');
  return [preset.motion, preset.hold || HOLD].join(String.fromCharCode(10));
}
