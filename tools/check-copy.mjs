/**
 * Copy guard — the writing rules of the typography spec (§07, «[UI-kit] Типографика»).
 *
 * UI strings are stored with the right characters; the font does not fix them. This reads every
 * string literal, template and JSX text of the UI layer (not comments, not code) and fails on:
 *   straight apostrophe   Can't        → Can’t
 *   straight quotes       "perf"       → “perf”
 *   three dots            Move...      → Move…
 *   hyphen as a dash      Not saved - offline → Not saved — offline
 *   bar as a separator    Anna | 14:32 → Anna · 14:32
 * Only prose is checked: JSX text, and strings with a space and a letter in them. Selectors,
 * paths, ids, CSS values and SVG geometry are left alone.
 *
 *   node tools/check-copy.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';
import ts from 'typescript';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['apps/frontend/src', 'packages/frontend/ui-kit/src'];
const SKIP_DIR = new Set(['node_modules', 'dist', 'generated', 'testing']);
// Tests repeat the component's strings; stories are demos
const SKIP_FILE = /\.(generated|spec|test|stories|d)\./;

// JSX attributes that hold code, not words
const CODE_ATTRIBUTES = new Set(['className', 'd', 'viewBox', 'points', 'transform', 'id', 'href', 'to', 'keys', 'key']);

const RULES = [
  { name: 'apostrophe', re: /[A-Za-z]'[A-Za-z]/, fix: '’' },
  { name: 'quotes', re: /(^|[\s(])"[^"]+"/, fix: '“…”' },
  { name: 'ellipsis', re: /\.\.\./, fix: '…' },
  { name: 'dash', re: /\S - \S/, fix: '— (em dash) between phrases, – (en dash) in ranges' },
  { name: 'separator', re: /\S \| \S/, fix: '·' },
];

const isProse = (text) => /\s/.test(text.trim()) && /[A-Za-z]/.test(text) && !/calc\(|var\(|url\(/.test(text);

function walk(dir, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR.has(entry.name)) walk(full, acc);
    } else if (['.ts', '.tsx'].includes(extname(entry.name)) && !SKIP_FILE.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const inCodeAttribute = (node) => {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isJsxAttribute(parent)) return CODE_ATTRIBUTES.has(parent.name.getText());
    if (ts.isJsxElement(parent) || ts.isJsxSelfClosingElement(parent)) return false;
  }
  return false;
};

const notWords = (node) =>
  ts.isImportDeclaration(node.parent) ||
  ts.isExportDeclaration(node.parent) ||
  ts.isLiteralTypeNode(node.parent) ||
  (ts.isCallExpression(node.parent) && /^(require|import|querySelector|querySelectorAll|matches|closest)$/.test(
    node.parent.expression.getText().split('.').pop() ?? '',
  ));

const violations = [];
const files = ROOTS.filter((root) => existsSync(join(repoRoot, root))).flatMap((root) => walk(join(repoRoot, root), []));

for (const file of files) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);

  const check = (node, text) => {
    for (const rule of RULES) {
      if (rule.re.test(text)) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        violations.push({
          file: relative(repoRoot, file).replace(/\\/g, '/'),
          line: line + 1,
          rule: rule.name,
          text: text.trim().slice(0, 70),
          fix: rule.fix,
        });
      }
    }
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      if (node.text.trim()) check(node, node.text);
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      if (isProse(node.text) && !notWords(node) && !inCodeAttribute(node)) check(node, node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

if (violations.length) {
  console.error(`x UI strings with the wrong characters (${violations.length}):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.text}  — use ${v.fix}`);
  }
  console.error('\n  The writing rules: [UI-kit] Типографика §07.');
  process.exit(1);
}
console.log(`ok UI strings (${files.length} files scanned)`);
