/** Homework media policy. Attachments are optional; each media type is validated independently. */
export const homeworkMediaRules = {
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
} as const;
export type HomeworkMediaKind = 'image' | 'audio' | 'video';
export function validateHomeworkMediaCounts(mimes: string[]): boolean {
  if (
    mimes.length > 5 ||
    !mimes.every((m) => Object.prototype.hasOwnProperty.call(homeworkMediaRules, m))
  )
    return false;
  const kinds = mimes.map((m) => homeworkMediaRules[m as keyof typeof homeworkMediaRules].kind);
  return (
    kinds.filter((kind) => kind === 'image').length <= 3 &&
    kinds.filter((kind) => kind === 'audio').length <= 1 &&
    kinds.filter((kind) => kind === 'video').length <= 1
  );
}
export function homeworkMediaAllowed(mime: string, size: unknown): boolean {
  const r = homeworkMediaRules[mime as keyof typeof homeworkMediaRules];
  return !!r && typeof size === 'number' && Number.isSafeInteger(size) && size > 0 && size <= r.max;
}
