/** Normalize formatting when regression tests inspect implementation text. */
export const compactSource = (text: string): string => text.replace(/\s+/g, '');
