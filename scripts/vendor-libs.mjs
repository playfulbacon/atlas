#!/usr/bin/env node
/**
 * Copies the browser builds of the physics libraries into vendor/, so the game
 * runs straight from the repo with no bundler and no node_modules.
 *
 * Run after bumping either dependency in package.json:
 *   npm install && npm run vendor
 */
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'vendor');

const LIBS = [
  { pkg: 'matter-js', from: 'build/matter.min.js', to: 'matter.min.js', global: 'Matter' },
  { pkg: 'poly-decomp', from: 'build/decomp.min.js', to: 'decomp.min.js', global: 'decomp' },
];

await mkdir(OUT, { recursive: true });

for (const lib of LIBS) {
  const base = path.join(ROOT, 'node_modules', lib.pkg);
  const { version } = JSON.parse(await readFile(path.join(base, 'package.json'), 'utf8'));
  await copyFile(path.join(base, lib.from), path.join(OUT, lib.to));
  console.log(`vendor/${lib.to}  ←  ${lib.pkg}@${version}  (window.${lib.global})`);
}
