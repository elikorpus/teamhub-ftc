/**
 * Bundle budget (spec §16.4):
 *  - initial JS (entry + modulepreloads) ≤ 181 KB gzip for a core-only build, plus 1.5 KB per enabled tab
 *    (181 since 1.1.7: loading states in the shared buttons, checkboxes and forms)
 *    (each tab registers a tiny always-loaded client: icon, lazy routes, widgets, search)
 *  - each lazy chunk ≤ 60 KB gzip (exception: the 3D viewer chunk)
 *  - disabled modules contribute 0 bytes (their ids/markers never appear in the output)
 * Usage: tsx tools/scripts/check-bundle.ts [--enabled id1,id2] [--json]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const DIST = join(import.meta.dirname, '..', '..', 'dashboard', 'dist');
const INITIAL_BUDGET = 181 * 1024;
const CHUNK_BUDGET = 60 * 1024;
const PER_MODULE = 1.5 * 1024;
const CHUNK_EXCEPTIONS = [/^three-/, /^ModelViewer-/, /^react-/, /^supabase-/];

export interface BundleReport {
  initial: number;
  initialFiles: { file: string; gzip: number }[];
  chunks: { file: string; gzip: number }[];
  problems: string[];
}

export function checkBundle(enabled?: string[], allModuleIds: string[] = []): BundleReport {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const eager = new Set<string>();
  for (const m of html.matchAll(/(?:src|href)="[^"]*assets\/([^"]+\.js)"/g)) eager.add(m[1]);
  const assets = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.js'));
  const gz = (f: string) => gzipSync(readFileSync(join(DIST, 'assets', f))).length;
  const initialFiles = [...eager].map((file) => ({ file, gzip: gz(file) }));
  const initial = initialFiles.reduce((s, f) => s + f.gzip, 0);
  const chunks = assets.filter((f) => !eager.has(f)).map((file) => ({ file, gzip: gz(file) }));
  const problems: string[] = [];
  const budget = INITIAL_BUDGET + (enabled?.length ?? 0) * PER_MODULE;
  if (initial > budget) problems.push(`Initial JS is ${(initial / 1024).toFixed(1)} KB gzip (budget ${(budget / 1024).toFixed(1)} KB)`);
  for (const c of chunks) {
    if (c.gzip > CHUNK_BUDGET && !CHUNK_EXCEPTIONS.some((r) => r.test(c.file))) problems.push(`Chunk ${c.file} is ${(c.gzip / 1024).toFixed(1)} KB gzip (budget 60 KB)`);
  }
  if (enabled) {
    // Each module embeds a marker string `teamhub-module:<id>` in its client file; disabled ones must be absent.
    const all = assets.map((f) => readFileSync(join(DIST, 'assets', f), 'utf8')).join('\n');
    for (const id of allModuleIds) {
      const present = new RegExp(`teamhub-module:${id}[\`"']`).test(all);
      if (!enabled.includes(id) && present) problems.push(`Disabled module "${id}" is present in the bundle`);
      if (enabled.includes(id) && !present) problems.push(`Enabled module "${id}" is missing from the bundle`);
    }
  }
  return { initial, initialFiles, chunks, problems };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--enabled');
  const enabled = i >= 0 ? (process.argv[i + 1] ?? '').split(',').filter(Boolean) : undefined;
  const all = readdirSync(join(import.meta.dirname, '..', '..', 'tabs')).filter((d) => d !== 'integrations');
  const r = checkBundle(enabled, all);
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`Initial JS: ${(r.initial / 1024).toFixed(1)} KB gzip`);
    for (const f of r.initialFiles.sort((a, b) => b.gzip - a.gzip)) console.log(`  ${(f.gzip / 1024).toFixed(1).padStart(6)} KB  ${f.file}`);
    for (const p of r.problems) console.error(`error: ${p}`);
  }
  process.exit(r.problems.length ? 1 : 0);
}
