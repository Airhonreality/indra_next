#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { extractDavEntries, parseCurlFile, replayCurl } from './common.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--curl' || token === '-c') args.curl = argv[++i];
    else if (token === '--out' || token === '-o') args.out = argv[++i];
    else if (token === '--raw' || token === '-r') args.raw = argv[++i];
  }
  return args;
}

function printTable(entries) {
  const rows = entries.map((entry) => ({
    type: entry.isFolder ? 'folder' : 'file',
    size: entry.isFolder ? '-' : String(entry.contentLength || '-'),
    fileId: entry.fileId || '-',
    name: entry.name,
    path: entry.path,
    mime: entry.contentType || '-',
  }));

  const columns = ['type', 'size', 'fileId', 'name', 'mime'];
  const widths = Object.fromEntries(columns.map((key) => [key, key.length]));
  for (const row of rows) {
    for (const key of columns) {
      widths[key] = Math.max(widths[key], String(row[key]).length);
    }
  }

  const line = columns.map((key) => key.padEnd(widths[key])).join('  ');
  console.log(line);
  console.log(columns.map((key) => '-'.repeat(widths[key])).join('  '));
  for (const row of rows) {
    console.log(columns.map((key) => String(row[key]).padEnd(widths[key])).join('  '));
    console.log(`  ${row.path}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.curl) {
    throw new Error('Uso: node scripts/clarodrive/list.mjs --curl path/to/request.txt [--out manifest.json]');
  }

  const parsed = await parseCurlFile(resolve(args.curl));
  const response = await replayCurl(parsed, {
    method: 'SEARCH',
    headers: {
      Accept: 'text/plain, application/xml;q=0.9, */*;q=0.8',
      'Content-Type': 'text/xml',
      Depth: 'infinity',
    },
  });

  const text = await response.text();
  if (!response.ok && response.status !== 207) {
    throw new Error(`SEARCH falló con HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  const entries = extractDavEntries(text, parsed.url);
  const manifest = {
    generatedAt: new Date().toISOString(),
    source: {
      url: parsed.url,
      method: 'SEARCH',
    },
    count: entries.length,
    entries,
  };

  const outPath = resolve(args.out || 'clarodrive-manifest.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(manifest, null, 2), 'utf8');

  if (args.raw) {
    const rawPath = resolve(args.raw);
    await mkdir(dirname(rawPath), { recursive: true });
    await writeFile(rawPath, text, 'utf8');
  }

  console.log(`Manifest guardado en: ${outPath}`);
  console.log(`Entradas: ${entries.length}`);
  printTable(entries.slice(0, 200));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
