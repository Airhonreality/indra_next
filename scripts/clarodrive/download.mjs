#!/usr/bin/env node
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import {
  buildPreviewUrl,
  buildShardHostCandidates,
  isPreviewableContentType,
  parseCurlFile,
  replayCurl,
  requestDirectDownloadUrl,
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
    return files.filter((entry) => entry.href === args.href || entry.path === args.href);
  }

  if (args.fileId) {
    return files.filter((entry) => entry.fileId === String(args.fileId));
  }

  if (args.match) {
    const needle = String(args.match).toLowerCase();
    return files.filter((entry) => entry.name.toLowerCase().includes(needle) || entry.path.toLowerCase().includes(needle));
  }

  return files;
}

function buildTargetPath(outputDir, relativePath) {
  return resolve(outputDir, safeJoinPosix('.', relativePath).replaceAll('/', '\\'));
}

async function writeResponseToPath(response, targetPath, label) {
  if (!response.ok || !response.body) {
    const details = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} ${details.slice(0, 200)}`);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) {
    const details = await response.text().catch(() => '');
    throw new Error(`Respuesta HTML inesperada para ${label}: ${details.slice(0, 200)}`);
  }

  await mkdir(dirname(targetPath), { recursive: true });

  try {
    const existing = await stat(targetPath);
    if (existing.size > 0) {
      return { targetPath, skipped: true };
    }
  } catch {
    // El archivo todavía no existe.
  }

  const writeStream = createWriteStream(targetPath);
  await pipeline(Readable.fromWeb(response.body), writeStream);
  return { targetPath, skipped: false };
}

async function attemptOriginalDownload(parsed, entry, outputDir, scopePrefix) {
  const relative = toLocalRelativePath(entry, scopePrefix);
  const targetPath = buildTargetPath(outputDir, relative);
  const response = await replayCurl(parsed, {
    url: entry.href,
    method: 'GET',
    headers: {
      Accept: '*/*',
      Range: undefined,
    },
  });
  const result = await writeResponseToPath(response, targetPath, entry.path);
  return {
    ...result,
    recoveryType: 'original',
    sourceUrl: entry.href,
  };
}

async function attemptDirectLinkDownload(parsed, entry, outputDir, scopePrefix) {
  if (!entry.fileId) return null;

  const directUrl = await requestDirectDownloadUrl(parsed, entry.fileId);
  const relative = toLocalRelativePath(entry, scopePrefix);
  const targetPath = buildTargetPath(outputDir, relative);
  const response = await replayCurl(parsed, {
    url: directUrl,
    method: 'GET',
    headers: {
      Accept: '*/*',
      Range: undefined,
    },
  });
  const result = await writeResponseToPath(response, targetPath, directUrl);
  return {
    ...result,
    recoveryType: 'direct-link',
    sourceUrl: directUrl,
  };
}

async function attemptShardSweepDownload(parsed, entry, outputDir, scopePrefix) {
  const relative = toLocalRelativePath(entry, scopePrefix);
  const targetPath = buildTargetPath(outputDir, relative);
  const original = new URL(entry.href);
  const candidates = buildShardHostCandidates(parsed.url);

  for (const candidateOrigin of candidates) {
    const candidate = new URL(original.toString());
    const originUrl = new URL(candidateOrigin);
    candidate.protocol = originUrl.protocol;
    candidate.host = originUrl.host;

    if (candidate.toString() === entry.href) continue;

    const response = await replayCurl(parsed, {
      url: candidate.toString(),
      method: 'GET',
      headers: {
        Accept: '*/*',
        Range: undefined,
      },
    });

    try {
      const result = await writeResponseToPath(response, targetPath, candidate.toString());
      return {
        ...result,
        recoveryType: 'shard-sweep',
        sourceUrl: candidate.toString(),
      };
    } catch {
      // El shard no resolvió este objeto; seguimos con el siguiente.
    }
  }

  return null;
}

async function attemptPreviewDownload(parsed, entry, outputDir, scopePrefix) {
  if (!entry.fileId) return null;
  if (!entry.hasPreview && !isPreviewableContentType(entry.contentType)) return null;

  const previewUrl = buildPreviewUrl(parsed.url, entry.fileId, entry.etag || '');
  const relative = toLocalRelativePath(entry, scopePrefix);
  const previewTargetPath = buildTargetPath(outputDir, `${relative}.preview.webp`);
  const response = await replayCurl(parsed, {
    url: previewUrl,
    method: 'GET',
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    },
  });
  const result = await writeResponseToPath(response, previewTargetPath, previewUrl);
  return {
    ...result,
    recoveryType: 'preview',
    sourceUrl: previewUrl,
  };
}

async function downloadOne(parsed, entry, outputDir, scopePrefix) {
  const attempts = [];

  try {
    return await attemptOriginalDownload(parsed, entry, outputDir, scopePrefix);
  } catch (error) {
    attempts.push(`original: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (entry.fileId) {
    try {
      const directResult = await attemptDirectLinkDownload(parsed, entry, outputDir, scopePrefix);
      if (directResult) {
        return directResult;
      }
    } catch (error) {
      attempts.push(`direct-link: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    const shardResult = await attemptShardSweepDownload(parsed, entry, outputDir, scopePrefix);
    if (shardResult) {
      return shardResult;
    }
  } catch (error) {
    attempts.push(`shard-sweep: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const previewResult = await attemptPreviewDownload(parsed, entry, outputDir, scopePrefix);
    if (previewResult) {
      return previewResult;
    }
  } catch (error) {
    attempts.push(`preview: ${error instanceof Error ? error.message : String(error)}`);
  }

  throw new Error(`Fallo al descargar ${entry.path}: ${attempts.join(' | ')}`);
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
  let downloaded = 0;
  let skipped = 0;
  const failures = [];
  const succeeded = [];

  for (const entry of limited) {
    index += 1;
    console.log(`[${index}/${limited.length}] Descargando ${entry.name} ...`);
    try {
      const result = await downloadOne(parsed, entry, outputDir, scopePrefix);
      if (result.skipped) {
        skipped += 1;
        console.log(`  -> ya existía: ${result.targetPath}`);
      } else {
        downloaded += 1;
        console.log(`  -> ${result.targetPath}${result.recoveryType !== 'original' ? ` [${result.recoveryType}]` : ''}`);
      }
      succeeded.push({
        path: entry.path,
        fileId: entry.fileId,
        href: entry.href,
        targetPath: result.targetPath,
        skipped: result.skipped,
        recoveryType: result.recoveryType,
        sourceUrl: result.sourceUrl,
      });
    } catch (error) {
      failures.push({
        path: entry.path,
        fileId: entry.fileId,
        href: entry.href,
        message: error instanceof Error ? error.message : String(error),
      });
      console.error(`  !! ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`Descarga terminada en: ${outputDir}`);
  console.log(`Nuevos: ${downloaded} | Reutilizados: ${skipped} | Fallidos: ${failures.length}`);
  const report = {
    generatedAt: new Date().toISOString(),
    outputDir,
    manifest: args.manifest,
    sourceCurl: args.curl,
    totals: {
      requested: limited.length,
      downloaded,
      reused: skipped,
      failed: failures.length,
    },
    succeeded,
    failures,
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, 'clarodrive-download-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (failures.length > 0) {
    console.log('Archivos fallidos:');
    for (const failure of failures) {
      console.log(`- ${failure.path}`);
      console.log(`  ${failure.message}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
