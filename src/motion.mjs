// The wallpaper as a loop: the picture that is already up becomes the first frame and
// only the small motions change, so the desktop keeps its layout. Both halves of the
// text come from the preset, where the prose lives.
export function animate({ preset }) {
  if (!preset.motion) throw new Error('preset ' + preset.name + ' has no motion block, nothing to animate');
  if (!preset.hold) throw new Error('preset ' + preset.name + ' has no hold block, nothing to pin the loop to');
  return [preset.motion, preset.hold].join(String.fromCharCode(10));
}
