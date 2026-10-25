/**
 * Literal guard — monorepo-wide.
 *
 * "A literal color, px, ms or z-index in a component is a build error."
 * Scans the UI layer of the monorepo (.css / .scss / .ts / .tsx) and fails if
 * it finds a hardcoded value instead of a token. The token layer, generated
 * files and tests are excluded.
 *
 *   node tools/check-no-literals.mjs
 *
 * This is the "grep the diff" review check, automated. Runs on pull requests
 * (see .github/workflows) and via `pnpm run check:literals`.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

// Roots to scan — the UI layer of the monorepo. Add new frontend roots here.
const ROOTS = ['apps', 'packages/frontend'];

const EXT = new Set(['.css', '.scss', '.ts', '.tsx']);
// Directories that are never scanned. `tokens` is where literals are legal.
const SKIP_DIR = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.nx',
  '.git',
  'tokens',
  'storybook-static',
  '.storybook',
]);
// Files that are never scanned: generated output and tests/stories.
const SKIP_FILE = /\.(generated|spec|test|stories)\./;

const STYLES = new Set(['.css', '.scss']);
const SCRIPTS = new Set(['.ts', '.tsx']);

// `only`: the extensions a rule applies to (all when absent); `skip`: files it leaves out.
const RULES = [
  { name: 'hex-color', re: /#[0-9a-fA-F]{3,8}\b/ },
  { name: 'px', re: /(?<![\w-])-?\d*\.?\d+px\b/ },
  { name: 'ms', re: /(?<![\w-])-?\d*\.?\d+ms\b/ },
  { name: 'z-index', re: /z-index\s*:\s*-?\d+/ },

  // Typography (spec: [UI-kit] Типографика). A step is its size and its line height together:
  // `@include typography.type(step)`, never the size alone
  {
    name: 'type-step',
    re: /font-size\s*:\s*var\(--type-/,
    only: STYLES,
    skip: /_typography\.scss$/,
    hint: 'use `@include typography.type(step)`: the size with its line height',
  },
  { name: 'font-size', re: /font-size\s*:(?!\s*(?:var\(|inherit))/, only: STYLES },
  { name: 'font-weight', re: /font-weight\s*:(?!\s*(?:var\(--weight-|inherit))/, only: STYLES },
  {
    name: 'line-height',
    re: /line-height\s*:(?!\s*(?:var\(--lh-|1;|inherit|normal))/,
    only: STYLES,
    hint: 'the line height comes with the step; `1` only for one line centred in a box',
  },
  { name: 'tracking', re: /letter-spacing\s*:(?!\s*var\()/, only: STYLES, hint: 'tracking is 0' },
  { name: 'caps', re: /text-transform\s*:\s*(uppercase|capitalize)/, only: STYLES, hint: 'no caps' },
  {
    name: 'italic',
    re: /font-style\s*:\s*italic/,
    only: STYLES,
    hint: 'the interface never writes in italic',
  },
  {
    name: 'inline-type',
    re: /\b(fontSize|fontWeight|lineHeight|letterSpacing)\s*:/,
    only: SCRIPTS,
    hint: 'use `Text` / `Heading`, or the step in module CSS',
  },
];

// Lines that must not be treated as a violation (css imports, comments).
const IGNORE_LINE = [
  /\.(css|scss)['"]/, // import '...tokens.css'
  /^\s*\/\//,
  /^\s*\*/,
];

function walk(dir, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR.has(entry.name)) walk(full, acc);
    } else if (EXT.has(extname(entry.name)) && !SKIP_FILE.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const files = [];
for (const root of ROOTS) {
  const abs = join(repoRoot, root);
  if (existsSync(abs)) walk(abs, files);
}

const violations = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (IGNORE_LINE.some((re) => re.test(line))) return;
    for (const rule of RULES) {
      if (rule.only && !rule.only.has(extname(file))) continue;
      if (rule.skip?.test(file)) continue;
      if (rule.re.test(line)) {
        violations.push({
          file: relative(repoRoot, file).replace(/\\/g, '/'),
          line: i + 1,
          rule: rule.name,
          text: line.trim().slice(0, 80),
          hint: rule.hint,
        });
      }
    }
  });
}

if (violations.length) {
  console.error(`x found literals instead of tokens (${violations.length}):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.text}${v.hint ? `  — ${v.hint}` : ''}`);
  }
  console.error(
    '\n  Replace the value with a layer 2/3 token, or add a token to tokens.css.',
  );
  process.exit(1);
}
console.log(`ok no literals in components (${files.length} files scanned)`);
