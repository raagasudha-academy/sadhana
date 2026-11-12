/** Strict media limits for isolated M9 homework evidence. */
export const M9_MEDIA_TYPES = Object.freeze({
  'image/jpeg': { kind: 'image', ext: 'jpg', max: 5_000_000 },
  'image/png': { kind: 'image', ext: 'png', max: 5_000_000 },
  'image/webp': { kind: 'image', ext: 'webp', max: 5_000_000 },
  'image/heic': { kind: 'image', ext: 'heic', max: 10_000_000 },
  'image/heif': { kind: 'image', ext: 'heif', max: 10_000_000 },
  'audio/mpeg': { kind: 'audio', ext: 'mp3', max: 20_000_000 },
  'audio/mp4': { kind: 'audio', ext: 'm4a', max: 20_000_000 },
  'audio/aac': { kind: 'audio', ext: 'aac', max: 20_000_000 },
  'audio/wav': { kind: 'audio', ext: 'wav', max: 20_000_000 },
  'audio/x-wav': { kind: 'audio', ext: 'wav', max: 20_000_000 },
  'video/mp4': { kind: 'video', ext: 'mp4', max: 100_000_000 },
  'video/quicktime': { kind: 'video', ext: 'mov', max: 100_000_000 },
  'video/3gpp': { kind: 'video', ext: '3gp', max: 100_000_000 },
});
export function validateM9MediaType(mime, size) {
  const x = M9_MEDIA_TYPES[mime];
  return x && Number.isSafeInteger(size) && size > 0 && size <= x.max ? x : null;
}
export const m9MediaId = (id) =>
  typeof id === 'string' &&
  /^MEDIA-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
export function validateM9MediaSelection(mimes) {
  if (!Array.isArray(mimes) || mimes.length > 4) return false;
  const kinds = [];
  for (const mime of mimes) {
    const x = M9_MEDIA_TYPES[mime];
    if (!x) return false;
    kinds.push(x.kind);
  }
  return (
    kinds.filter((x) => x === 'image').length <= 2 &&
    kinds.filter((x) => x === 'audio').length <= 1 &&
    kinds.filter((x) => x === 'video').length <= 1
  );
}
