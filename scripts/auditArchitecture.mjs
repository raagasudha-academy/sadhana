#!/usr/bin/env node
/** Read-only Sadhana architecture audit. Requires Node.js 20+. */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
if (
  !existsSync(path.join(root, 'package.json')) ||
  !existsSync(path.join(root, 'backend', 'package.json'))
) {
  console.error('Run from the Sadhana repository root.');
  process.exit(1);
}
const git = (...args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
const gitOr = (fallback, ...args) => {
  try {
    return git(...args);
  } catch {
    return fallback;
  }
};
const tracked = git('ls-files', '-z').split('\0').filter(Boolean);
const source = tracked.filter(
  (f) => /^(app\/src|backend\/src)\/.*\.(tsx?|css)$/.test(f) && existsSync(f),
);
const rows = source.map((file) => {
  const contents = readFileSync(file, 'utf8');
  const imports = [
    ...contents.matchAll(/(?:import\s+(?:[^'";]*?\s+from\s*)?|import\s*)['"]([^'"]+)['"]/g),
  ].map((m) => m[1]);
  return { file, lines: contents.split(/\r?\n/).length, bytes: statSync(file).size, imports };
});
const top = [...rows].sort((a, b) => b.lines - a.lines).slice(0, 30);
const versioned = tracked.filter(
  (f) =>
    /(?:^|\/)[^/]*[Vv](?:\d{1,3})(?:[._-]|\d)/.test(path.basename(f)) && /\.(?:tsx?|css)$/.test(f),
);
const suspect = tracked.filter((f) =>
  /(?:^|\/)(?:[^/]*\.(?:zip|bak|orig|rej|pyc)|[^/]*~|\.DS_Store)$/.test(f),
);
const cssImports = rows.flatMap((r) =>
  r.imports.filter((i) => i.endsWith('.css')).map((i) => ({ from: r.file, css: i })),
);
const entry = [
  'app/src/App.tsx',
  'app/src/StudentHome.tsx',
  'app/src/RegistrationModule.tsx',
  'backend/src/lambda.ts',
];
const countReferences = (file) => {
  const base = file.replace(/\.(?:tsx?|css)$/, '');
  const name = path.basename(base);
  return rows.filter((r) => r.file !== file && r.imports.some((i) => i.includes(name))).length;
};
const report = [
  '# Sadhana architecture inventory',
  '',
  `Generated: ${new Date().toISOString()}`,
  `Git HEAD: \`${gitOr('(no commit)', 'rev-parse', '--short', 'HEAD')}\``,
  `Branch: \`${gitOr('', 'branch', '--show-current') || '(detached)'}\``,
  `Tracked TypeScript/TSX/CSS source files: **${rows.length}**`,
  '',
  '## Largest files',
  '| File | Lines | Approximate source imports by other files* |',
  '|---|---:|---:|',
  ...top.map((r) => `| \`${r.file}\` | ${r.lines} | ${countReferences(r.file)} |`),
  '',
  '*Reference counts are heuristics based on import specifiers, not an authoritative dependency graph.*',
  '',
  '## Core entrypoints',
  ...entry.map((f) => `- \`${f}\`: ${rows.find((r) => r.file === f)?.lines ?? 'missing'} lines`),
  '',
  '## Version-like source filenames (review, do not rename automatically)',
  ...(versioned.length ? versioned.map((f) => `- \`${f}\``) : ['- None detected']),
  '',
  '## Tracked backup/archive artefacts (review, do not delete automatically)',
  ...(suspect.length ? suspect.map((f) => `- \`${f}\``) : ['- None detected']),
  '',
  '## CSS imports (review order and global leakage)',
  ...(cssImports.length
    ? cssImports.map((x) => `- \`${x.from}\` → \`${x.css}\``)
    : ['- None detected in scanned source files']),
  '',
  '## Suggested boundaries (subject to source review)',
  '- `app/src`: active frontend source, organized by application area and feature',
  '- `app/tests`: frontend unit and component regression tests',
  '- `backend/src`: Lambda entrypoint, domain modules and colocated unit tests',
  '- `backend/src`: retain existing Lambda entrypoint and extract domain routes incrementally',
  '',
  '## Safety gate',
  'Before extraction: `npm run verify` and `(cd backend && npm run check && npm run build)`.',
  'Do not rename CSS or move backend security handlers based only on this report.',
  '',
].join('\n');
process.stdout.write(report);
