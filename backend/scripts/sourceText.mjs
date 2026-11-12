/** Remove formatting whitespace around syntax while preserving strings and comments. */
export function normalizeCodeWhitespace(source) {
  let output = '';
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const previous = source[index - 1];
    const next = source[index + 1];

    if (lineComment) {
      output += current;
      if (current === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      output += current;
      if (current === '*' && next === '/') {
        output += next;
        index += 1;
        blockComment = false;
      }
      continue;
    }
    if (quote) {
      output += current;
      if (current === quote && previous !== '\\') quote = null;
      continue;
    }
    if (current === '/' && next === '/') {
      output += current + next;
      index += 1;
      lineComment = true;
      continue;
    }
    if (current === '/' && next === '*') {
      output += current + next;
      index += 1;
      blockComment = true;
      continue;
    }
    if (current === "'" || current === '"' || current === '`') {
      quote = current;
      output += current;
      continue;
    }
    if (/\s/.test(current)) {
      let nextIndex = index + 1;
      while (nextIndex < source.length && /\s/.test(source[nextIndex])) nextIndex += 1;
      const before = output.at(-1) ?? '';
      const after = source[nextIndex] ?? '';
      const syntax = /[{}()[\].,:;=<>!?+*/%&|~-]/;
      if (syntax.test(before) || syntax.test(after)) index = nextIndex - 1;
      else output += current;
      continue;
    }
    output += current;
  }
  return output;
}
