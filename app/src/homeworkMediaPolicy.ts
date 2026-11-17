const homeworkMediaTypes: Record<string, { kind: 'image' | 'audio' | 'video'; max: number }> = {
  'image/jpeg': { kind: 'image', max: 5_000_000 },
  'image/png': { kind: 'image', max: 5_000_000 },
  'image/webp': { kind: 'image', max: 5_000_000 },
  'image/heic': { kind: 'image', max: 10_000_000 },
  'image/heif': { kind: 'image', max: 10_000_000 },
  'audio/mpeg': { kind: 'audio', max: 20_000_000 },
  'audio/mp4': { kind: 'audio', max: 20_000_000 },
  'audio/aac': { kind: 'audio', max: 20_000_000 },
  'audio/wav': { kind: 'audio', max: 20_000_000 },
  'audio/x-wav': { kind: 'audio', max: 20_000_000 },
  'video/mp4': { kind: 'video', max: 100_000_000 },
  'video/quicktime': { kind: 'video', max: 100_000_000 },
  'video/3gpp': { kind: 'video', max: 100_000_000 },
};

export const homeworkMimeForFile = (file: File) => {
  if (file.type) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  const byExtension: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    wav: 'audio/wav',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    '3gp': 'video/3gpp',
  };
  return byExtension[extension || ''] || '';
};

export const homeworkFileAllowed = (file: File) => {
  const rule = homeworkMediaTypes[homeworkMimeForFile(file)];
  return !!rule && file.size > 0 && file.size <= rule.max;
};

export const homeworkSelectionAllowed = (mimes: string[]) => {
  if (mimes.length > 5) return false;
  const types = mimes.map((mime) => homeworkMediaTypes[mime]?.kind);
  return (
    types.every(Boolean) &&
    types.filter((kind) => kind === 'image').length <= 3 &&
    types.filter((kind) => kind === 'audio').length <= 1 &&
    types.filter((kind) => kind === 'video').length <= 1
  );
};

export const learnerHomeworkSelectionAllowed = (mimes: string[]) => {
  if (mimes.length > 4) return false;
  const types = mimes.map((mime) => homeworkMediaTypes[mime]?.kind);
  return (
    types.every(Boolean) &&
    types.filter((kind) => kind === 'image').length <= 2 &&
    types.filter((kind) => kind === 'audio').length <= 1 &&
    types.filter((kind) => kind === 'video').length <= 1
  );
};

export const homeworkMediaMaxBytes = (mime: string) => homeworkMediaTypes[mime]?.max || 0;
