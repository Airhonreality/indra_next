#!/usr/bin/env node
import { createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import {
  parseCurlFile,
  replayCurl,
  toLocalRelativePath,
  extractScopePrefix,
  safeJoinPosix,
} from './common.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--curl' || token === '-c') args.curl = argv[++i];
    else if (token === '--manifest' || token === '-m') args.manifest = argv[++i];
    else if (token === '--out' || token === '-o') args.out = argv[++i];
    else if (token === '--href') args.href = argv[++i];
    else if (token === '--file-id') args.fileId = argv[++i];
    else if (token === '--match') args.match = argv[++i];
    else if (token === '--limit') args.limit = Number(argv[++i]);
  }
  return args;
}

function selectEntries(manifest, args) {
  const files = manifest.entries.filter((entry) => !entry.isFolder);

  if (args.href) {
    const selected = files.filter((entry) => entry.href === args.href || entry.path === args.href);
    return selected;
  }

  if (args.fileId) {
    const selected = files.filter((entry) => entry.fileId === String(args.fileId));
    return selected;
  }

  if (args.match) {
    const needle = String(args.match).toLowerCase();
    return files.filter((entry) => entry.name.toLowerCase().includes(needle) || entry.path.toLowerCase().includes(needle));
  }

  return files;
}

async function downloadOne(parsed, entry, outputDir, scopePrefix) {
  const response = await replayCurl(parsed, {
    url: entry.href,
    method: 'GET',
    headers: {
      Accept: '*/*',
      Range: undefined,
    },
  });

  if (!response.ok || !response.body) {
    const details = await response.text().catch(() => '');
    throw new Error(`Fallo al descargar ${entry.path}: HTTP ${response.status} ${details.slice(0, 200)}`);
  }

  const relative = toLocalRelativePath(entry, scopePrefix);
  const targetPath = resolve(outputDir, safeJoinPosix('.', relative).replaceAll('/', '\\'));
  await mkdir(dirname(targetPath), { recursive: true });

  const writeStream = createWriteStream(targetPath);
  await pipeline(Readable.fromWeb(response.body), writeStream);

  return targetPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.curl || !args.manifest) {
    throw new Error('Uso: node scripts/clarodrive/download.mjs --curl request.txt --manifest clarodrive-manifest.json [--href ... | --file-id ... | --match ...] [--out folder]');
  }

  const parsed = await parseCurlFile(resolve(args.curl));
  const manifestText = await readFile(resolve(args.manifest), 'utf8');
  const manifest = JSON.parse(manifestText);
  const outputDir = resolve(args.out || 'clarodrive-downloads');
  const selected = selectEntries(manifest, args);
  const scopePrefix = extractScopePrefix(manifest.entries);

  if (selected.length === 0) {
    console.log('No hay archivos que coincidan con el criterio.');
    return;
  }

  const limited = Number.isFinite(args.limit) && args.limit > 0 ? selected.slice(0, args.limit) : selected;
  let index = 0;
  for (const entry of limited) {
    index += 1;
    console.log(`[${index}/${limited.length}] Descargando ${entry.name} ...`);
    const savedTo = await downloadOne(parsed, entry, outputDir, scopePrefix);
    console.log(`  -> ${savedTo}`);
  }

  console.log(`Descarga completada en: ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
