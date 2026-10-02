/**
 * Builds the BLAKE3 hasher for the browser into the uploader library.
 *
 * The output is committed, so building the frontend needs neither Rust nor wasm-pack. Next to it
 * goes a fingerprint of everything the build depends on; `--check` recomputes it and fails when
 * the committed module is stale. That check needs only Node.
 *
 *   node tools/build-wasm.mjs           build (needs the wasm32-unknown-unknown target and wasm-pack)
 *   node tools/build-wasm.mjs --check   verify the committed build matches the sources (CI)
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const crateDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(crateDir, '..', '..', '..');
const outDir = join(repoRoot, 'packages', 'frontend', 'uploader', 'src', 'hasher', 'wasm');
const FINGERPRINT = join(outDir, 'SOURCE_FINGERPRINT');
const OUT_NAME = 'blake3';

/** Files wasm-pack writes that the library does not use. */
const UNUSED_OUTPUTS = ['.gitignore', 'package.json', 'README.md'];

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

/** Versions of the crates that end up in the module, as pinned in Cargo.lock. */
function lockedVersions(names) {
  const lock = readFileSync(join(repoRoot, 'Cargo.lock'), 'utf8');
  return names.map((name) => {
    const match = lock.match(new RegExp(`\\[\\[package\\]\\]\\nname = "${name}"\\nversion = "([^"]+)"`));
    if (!match) throw new Error(`${name} is not in Cargo.lock`);
    return `${name}@${match[1]}`;
  });
}

function fingerprint() {
  const hash = createHash('sha256');
  const inputs = [
    join(crateDir, 'Cargo.toml'),
    join(repoRoot, 'rust-toolchain.toml'),
    ...listFiles(join(crateDir, 'src')).sort(),
  ];
  for (const file of inputs) {
    // Line endings differ between checkouts on Windows and Linux; the build does not care
    const content = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    hash.update(`${relative(repoRoot, file).replaceAll('\\', '/')}\n${content}\n`);
  }
  hash.update(lockedVersions(['blake3', 'wasm-bindgen']).join('\n'));
  return hash.digest('hex');
}

if (process.argv.includes('--check')) {
  const expected = fingerprint();
  const actual = existsSync(FINGERPRINT) ? readFileSync(FINGERPRINT, 'utf8').trim() : '(missing)';
  if (actual !== expected) {
    console.error(
      'The committed BLAKE3 wasm module is out of date with packages/rust/blake3_wasm.\n' +
        'Rebuild it: pnpm nx run blake3-wasm:build-wasm',
    );
    process.exit(1);
  }
  console.log('BLAKE3 wasm module is up to date.');
} else {
  execFileSync(
    'wasm-pack',
    ['build', crateDir, '--target', 'web', '--release', '--no-pack', '--out-dir', outDir, '--out-name', OUT_NAME],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );
  for (const name of UNUSED_OUTPUTS) rmSync(join(outDir, name), { force: true });
  writeFileSync(FINGERPRINT, `${fingerprint()}\n`);
  console.log(`Wrote ${relative(repoRoot, outDir)}`);
}
