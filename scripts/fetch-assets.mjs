#!/usr/bin/env node
/**
 * Vendors every sprite referenced by src/data/objects.json into assets/objects/<id>.svg
 *
 * Two art sources:
 *   { "openmoji": "1F6C1" }   -> downloaded from the OpenMoji CDN (CC BY-SA 4.0)
 *   { "custom":   "anvil"  }  -> copied from assets/custom/anvil.svg
 *
 * Adding an object to the game is: one entry in objects.json + `npm run assets`.
 *
 *   node scripts/fetch-assets.mjs           download anything missing
 *   node scripts/fetch-assets.mjs --force   re-download everything
 *   node scripts/fetch-assets.mjs --check   verify only, exit 1 if something is missing
 */
import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets/objects');
const CUSTOM_DIR = path.join(ROOT, 'assets/custom');
const OPENMOJI_VERSION = '17.0.0';
const CDN = (hex) =>
  `https://cdn.jsdelivr.net/npm/openmoji@${OPENMOJI_VERSION}/color/svg/${hex}.svg`;

const force = process.argv.includes('--force');
const checkOnly = process.argv.includes('--check');

const exists = (p) => access(p).then(() => true, () => false);

const catalog = JSON.parse(await readFile(path.join(ROOT, 'src/data/objects.json'), 'utf8'));
await mkdir(OUT_DIR, { recursive: true });

// Catalog sanity checks — cheap guard against typos in a growing list.
const problems = [];
const seen = new Set();
for (const o of catalog) {
  if (seen.has(o.id)) problems.push(`duplicate id: ${o.id}`);
  seen.add(o.id);
  for (const field of ['id', 'name', 'weight', 'size', 'tier', 'art']) {
    if (o[field] === undefined) problems.push(`${o.id}: missing "${field}"`);
  }
  if (o.art && !o.art.openmoji && !o.art.custom) problems.push(`${o.id}: art needs "openmoji" or "custom"`);
}
if (problems.length) {
  console.error('Catalog problems:\n  ' + problems.join('\n  '));
  process.exit(1);
}

let downloaded = 0, copied = 0, skipped = 0;
const failed = [];

for (const o of catalog) {
  const dest = path.join(OUT_DIR, `${o.id}.svg`);
  if (!force && (await exists(dest))) { skipped++; continue; }
  if (checkOnly) { failed.push(`${o.id} (missing)`); continue; }

  try {
    if (o.art.custom) {
      const src = path.join(CUSTOM_DIR, `${o.art.custom}.svg`);
      if (!(await exists(src))) throw new Error(`no custom art at assets/custom/${o.art.custom}.svg`);
      await copyFile(src, dest);
      copied++;
    } else {
      const url = CDN(o.art.openmoji);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const svg = await res.text();
      if (!svg.includes('<svg')) throw new Error(`not an svg: ${url}`);
      await writeFile(dest, svg);
      downloaded++;
      process.stdout.write(`\r  downloaded ${downloaded}…   `);
    }
  } catch (err) {
    failed.push(`${o.id}: ${err.message}`);
  }
}

process.stdout.write('\r');
console.log(
  `${catalog.length} objects — ${downloaded} downloaded, ${copied} copied, ${skipped} already present.`
);
if (failed.length) {
  console.error(`\n${failed.length} failed:\n  ` + failed.join('\n  '));
  process.exit(1);
}
