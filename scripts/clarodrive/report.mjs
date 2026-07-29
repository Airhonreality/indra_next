#!/usr/bin/env node
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, resolve, relative } from 'node:path';
import { extractScopePrefix, toLocalRelativePath } from './common.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--manifest' || token === '-m') args.manifest = argv[++i];
    else if (token === '--out' || token === '-o') args.out = argv[++i];
    else if (token === '--json') args.json = argv[++i];
  }
  return args;
}

async function walkFiles(rootDir) {
  const entries = [];
  async function visit(current) {
    const items = await readdir(current, { withFileTypes: true });
    for (const item of items) {
      const fullPath = resolve(current, item.name);
      if (item.isDirectory()) {
        await visit(fullPath);
      } else if (item.isFile()) {
        entries.push(fullPath);
      }
    }
  }

  await visit(rootDir);
  return entries;
}

function toPosixPath(value) {
  return value.replaceAll('\\', '/');
}

function recoveryKey(value) {
  switch (value) {
    case 'original':
      return 'original';
    case 'direct-link':
      return 'directLink';
    case 'shard-sweep':
      return 'shardSweep';
    case 'preview':
      return 'preview';
    default:
      return 'unknown';
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifest || !args.out) {
    throw new Error('Uso: node scripts/clarodrive/report.mjs --manifest clarodrive-manifest.json --out downloaded-folder [--json report.json]');
  }

  const manifestText = await readFile(resolve(args.manifest), 'utf8');
  const manifest = JSON.parse(manifestText);
  const outputDir = resolve(args.out);
  const scopePrefix = extractScopePrefix(manifest.entries);
  const manifestFiles = manifest.entries.filter((entry) => !entry.isFolder);
  const onDiskFiles = (await walkFiles(outputDir)).filter((fullPath) => basename(fullPath) !== 'clarodrive-download-report.json');
  const onDiskRelative = new Map();

  for (const fullPath of onDiskFiles) {
    const rel = relative(outputDir, fullPath);
    onDiskRelative.set(toPosixPath(rel), fullPath);
  }

  const records = [];
  let recovered = 0;
  let missing = 0;
  let empty = 0;
  let zeroByte = 0;
  let sizeMismatch = 0;
  let matchedBytes = 0;
  let expectedBytes = 0;

  for (const entry of manifestFiles) {
    const relativePath = toLocalRelativePath(entry, scopePrefix).replaceAll('\\', '/');
    const diskPath = onDiskRelative.get(relativePath);
    const expectedSize = Number(entry.contentLength || 0);
    expectedBytes += expectedSize;

    if (!diskPath) {
      missing += 1;
      records.push({
        status: 'missing',
        path: entry.path,
        fileId: entry.fileId,
        expectedSize,
        localPath: null,
      });
      continue;
    }

    const info = await stat(diskPath);
    if (info.size === 0) {
      if (expectedSize === 0) {
        zeroByte += 1;
        recovered += 1;
        records.push({
          status: 'zero-byte',
          path: entry.path,
          fileId: entry.fileId,
          expectedSize,
          actualSize: info.size,
          localPath: diskPath,
        });
        continue;
      }

      empty += 1;
      records.push({
        status: 'empty',
        path: entry.path,
        fileId: entry.fileId,
        expectedSize,
        actualSize: info.size,
        localPath: diskPath,
      });
      continue;
    }

    if (expectedSize > 0 && info.size !== expectedSize) {
      sizeMismatch += 1;
      matchedBytes += info.size;
      records.push({
        status: 'size-mismatch',
        path: entry.path,
        fileId: entry.fileId,
        expectedSize,
        actualSize: info.size,
        localPath: diskPath,
      });
      continue;
    }

    recovered += 1;
    matchedBytes += info.size;
    records.push({
      status: 'recovered',
      path: entry.path,
      fileId: entry.fileId,
      expectedSize,
      actualSize: info.size,
      localPath: diskPath,
    });
  }

  const downloadReportPath = resolve(outputDir, 'clarodrive-download-report.json');
  let downloadReport = null;
  try {
    const text = await readFile(downloadReportPath, 'utf8');
    downloadReport = JSON.parse(text);
  } catch {
    downloadReport = null;
  }

  const recoveryBreakdown = {
    original: 0,
    directLink: 0,
    shardSweep: 0,
    preview: 0,
    unknown: 0,
  };
  const reusedRecoveryBreakdown = {
    original: 0,
    directLink: 0,
    shardSweep: 0,
    preview: 0,
    unknown: 0,
  };

  for (const item of downloadReport?.succeeded || []) {
    const key = recoveryKey(item.recoveryType);
    recoveryBreakdown[key] += 1;
    if (item.skipped) {
      reusedRecoveryBreakdown[key] += 1;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    manifest: resolve(args.manifest),
    outputDir,
    totals: {
      manifestFiles: manifestFiles.length,
      onDiskFiles: onDiskFiles.length,
      recovered,
      missing,
      empty,
      zeroByte,
      sizeMismatch,
      expectedBytes,
      matchedBytes,
    },
    verdict: missing === 0 && empty === 0 && sizeMismatch === 0 ? 'all-recovered' : 'partial-recovery',
    downloadSummary: downloadReport
      ? {
          totals: downloadReport.totals,
          recoveryBreakdown,
          reusedRecoveryBreakdown,
        }
      : null,
    confirmedServerFailures: downloadReport?.failures || [],
    records,
  };

  console.log(`Manifiesto: ${report.manifest}`);
  console.log(`Salida local: ${report.outputDir}`);
  console.log(`Archivos en manifiesto: ${report.totals.manifestFiles}`);
  console.log(`Archivos en disco: ${report.totals.onDiskFiles}`);
  console.log(`Recuperados: ${report.totals.recovered}`);
  console.log(`Faltantes: ${report.totals.missing}`);
  console.log(`Vacios: ${report.totals.empty}`);
  console.log(`Zero-byte: ${report.totals.zeroByte}`);
  console.log(`Desajuste de tamano: ${report.totals.sizeMismatch}`);
  console.log(`Bytes esperados: ${report.totals.expectedBytes}`);
  console.log(`Bytes presentes: ${report.totals.matchedBytes}`);
  console.log(`Veredicto: ${report.verdict}`);

  if (report.downloadSummary) {
    console.log('Recuperacion por tipo:');
    console.log(`- original: ${report.downloadSummary.recoveryBreakdown.original}`);
    console.log(`- direct-link: ${report.downloadSummary.recoveryBreakdown.directLink}`);
    console.log(`- shard-sweep: ${report.downloadSummary.recoveryBreakdown.shardSweep}`);
    console.log(`- preview: ${report.downloadSummary.recoveryBreakdown.preview}`);
    console.log(`- unknown: ${report.downloadSummary.recoveryBreakdown.unknown}`);
  }

  if (report.confirmedServerFailures.length > 0) {
    console.log('Fallos confirmados por el descargador:');
    for (const failure of report.confirmedServerFailures.slice(0, 20)) {
      console.log(`- ${failure.path}`);
      console.log(`  ${failure.message}`);
    }
    if (report.confirmedServerFailures.length > 20) {
      console.log(`... y ${report.confirmedServerFailures.length - 20} mas`);
    }
  }

  if (args.json) {
    await writeFile(resolve(args.json), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`JSON: ${resolve(args.json)}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
