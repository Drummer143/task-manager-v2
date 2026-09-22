/**
 * Design token generator.
 *
 * Source of truth — src/tokens/tokens.css. From it we build:
 *   • src/tokens/tokens.generated.ts   — types, var() references, numeric values
 *   • src/tokens/tokens.generated.scss — Sass map and token() function
 *
 *   node tools/generate-tokens.mjs           write files
 *   node tools/generate-tokens.mjs --check   verify they are in sync (CI), no write
 *
 * Rules the generator encodes:
 *   • primitives (--c-*) are excluded from the public TokenName — a component never sees them;
 *   • only scalar values (px / ms / unitless) from the base :root (not from @media) go into
 *     `raw`, because those are exactly the numbers JS logic needs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const tokensDir = join(here, '..', 'src', 'tokens');
const SRC = join(tokensDir, 'tokens.css');
const OUT_TS = join(tokensDir, 'tokens.generated.ts');
const OUT_SCSS = join(tokensDir, 'tokens.generated.scss');

const isPrimitive = (name) => name.startsWith('--c-');
const bare = (name) => name.replace(/^--/, '');

/** Strip block comments so they don't interfere with the scanner. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Flat brace scanner: collects every --name: value declaration, marking whether
 * the value is declared in the base :root outside @media (used for `raw`).
 */
function parse(css) {
  const src = stripComments(css);
  const order = []; // names in order of appearance
  const seen = new Set();
  const base = new Map(); // name -> value (last write in the base :root)
  const stack = [];
  let buf = '';

  const flushDecl = () => {
    const decl = buf.trim();
    buf = '';
    const m = decl.match(/^(--[A-Za-z0-9-]+)\s*:\s*([\s\S]+)$/);
    if (!m) return;
    const [, name, rawValue] = m;
    const value = rawValue.trim();
    if (!seen.has(name)) {
      seen.add(name);
      order.push(name);
    }
    const inMedia = stack.some((s) => s.startsWith('@'));
    const prelude = stack[stack.length - 1] ?? '';
    const isRoot = prelude.split(',').some((s) => s.trim() === ':root');
    if (!inMedia && isRoot) base.set(name, value);
  };

  for (const ch of src) {
    if (ch === '{') {
      stack.push(buf.trim());
      buf = '';
    } else if (ch === '}') {
      stack.pop();
      buf = '';
    } else if (ch === ';') {
      flushDecl();
    } else {
      buf += ch;
    }
  }
  return { order, base };
}

/** Scalar value → { n, unit } or null. */
function scalar(value) {
  let m;
  if ((m = value.match(/^(-?\d+(?:\.\d+)?)px$/))) return { n: Number(m[1]), unit: 'px' };
  if ((m = value.match(/^(-?\d+(?:\.\d+)?)ms$/))) return { n: Number(m[1]), unit: 'ms' };
  if ((m = value.match(/^(-?\d+(?:\.\d+)?)$/))) return { n: Number(m[1]), unit: 'none' };
  return null;
}

function build() {
  const css = readFileSync(SRC, 'utf8');
  const { order, base } = parse(css);

  const primitives = order.filter(isPrimitive).map(bare);
  const tokens = order.filter((n) => !isPrimitive(n)).map(bare);

  const raw = []; // [bareName, n, unit]
  for (const name of order) {
    if (isPrimitive(name)) continue;
    const value = base.get(name);
    if (value == null) continue;
    const s = scalar(value);
    if (s) raw.push([bare(name), s.n, s.unit]);
  }

  const banner = (ext) =>
    `${ext === 'scss' ? '//' : '/*'} AUTO-GENERATED from tokens.css — do not edit by hand.\n` +
    `${ext === 'scss' ? '//' : '  '} Edit tokens.css and run: nx run ui-kit:generate-tokens${ext === 'scss' ? '' : ' */'}\n`;

  const q = (s) => `'${s}'`;

  const ts =
    banner('ts') +
    '\n' +
    `export const PRIMITIVE_TOKENS = [\n${primitives.map((n) => `  ${q(n)},`).join('\n')}\n] as const;\n` +
    `export type PrimitiveToken = (typeof PRIMITIVE_TOKENS)[number];\n\n` +
    `export const TOKENS = [\n${tokens.map((n) => `  ${q(n)},`).join('\n')}\n] as const;\n` +
    `/** Token names of layers 2-3. Primitives (--c-*) are excluded on purpose: a component never sees them. */\n` +
    `export type TokenName = (typeof TOKENS)[number];\n\n` +
    `/** name → 'var(--name)'. For inline styles and CSS-in-JS. */\n` +
    `export const token = {\n${tokens
      .map((n) => `  ${q(n)}: 'var(--${n})',`)
      .join('\n')}\n} as const satisfies Record<TokenName, string>;\n\n` +
    `/** Scalar values (px/ms/unitless) from the base :root — for JS logic. */\n` +
    `export const raw = {\n${raw.map(([n, v]) => `  ${q(n)}: ${v},`).join('\n')}\n} as const;\n` +
    `export type RawTokenName = keyof typeof raw;\n\n` +
    `/** Unit of the matching raw value. */\n` +
    `export const rawUnit = {\n${raw
      .map(([n, , u]) => `  ${q(n)}: ${q(u)},`)
      .join('\n')}\n} as const satisfies Record<RawTokenName, 'px' | 'ms' | 'none'>;\n`;

  const scss =
    banner('scss') +
    '\n' +
    `@function token($name) {\n  @return var(--#{$name});\n}\n\n` +
    `$tokens: (\n${tokens
      .map((n) => `  ${q(n)}: var(--${n}),`)
      .join('\n')}\n);\n\n` +
    `$tokens-raw: (\n${raw.map(([n, v]) => `  ${q(n)}: ${v},`).join('\n')}\n);\n`;

  return { ts, scss, counts: { primitives: primitives.length, tokens: tokens.length, raw: raw.length } };
}

function main() {
  const check = process.argv.includes('--check');
  const { ts, scss, counts } = build();
  const targets = [
    [OUT_TS, ts],
    [OUT_SCSS, scss],
  ];

  if (check) {
    const stale = [];
    for (const [file, content] of targets) {
      let current = '';
      try {
        current = readFileSync(file, 'utf8');
      } catch {
        current = '';
      }
      if (current !== content) stale.push(relative(process.cwd(), file));
    }
    if (stale.length) {
      console.error(
        `x tokens are out of sync: ${stale.join(', ')}\n  run: nx run ui-kit:generate-tokens`
      );
      process.exit(1);
    }
    console.log('ok tokens are in sync');
    return;
  }

  for (const [file, content] of targets) writeFileSync(file, content);
  console.log(
    `ok tokens built: ${counts.tokens} semantic/component, ${counts.primitives} primitives, ${counts.raw} scalar`
  );
}

main();
