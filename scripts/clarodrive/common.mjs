import { readFile } from 'node:fs/promises';
import { posix as pathPosix } from 'node:path';

export async function parseCurlFile(curlFilePath) {
  const raw = await readFile(curlFilePath, 'utf8');
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\^/g, '');

  const urlMatch = normalized.match(/curl\s+"([^"]+)"/i);
  if (!urlMatch) {
    throw new Error('No se pudo encontrar la URL en el archivo cURL.');
  }

  const methodMatch = normalized.match(/-X\s+"?([A-Z]+)"?/i);
  const bodyMatch = normalized.match(/--data-raw\s+"([\s\S]*)"\s*$/i);
  const cookieMatch = normalized.match(/-b\s+"([\s\S]*?)"\s+-H\s+"depth:/i);
  const cookieFallbackMatch = normalized.match(/-b\s+"([\s\S]*?)"\s*$/i);

  const headers = {};
  for (const headerName of [
    'accept',
    'accept-language',
    'cache-control',
    'content-type',
    'depth',
    'origin',
    'pragma',
    'priority',
    'requesttoken',
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'sec-fetch-dest',
    'sec-fetch-mode',
    'sec-fetch-site',
    'sec-gpc',
    'user-agent',
    'x-requested-with',
  ]) {
    const headerMatch = normalized.match(new RegExp(`-H\\s+"${headerName}:\\s*([^"]*)"`, 'i'));
    if (headerMatch) {
      headers[headerName] = headerMatch[1];
    }
  }

  const cookieValue = cookieMatch?.[1] || cookieFallbackMatch?.[1] || '';
  if (cookieValue) {
    headers.cookie = cookieValue;
  }

  const body = bodyMatch?.[1]?.replace(/\\"/g, '"') || '';
  const method = methodMatch?.[1]?.toUpperCase() || (body ? 'POST' : 'GET');

  return {
    raw,
    normalized,
    url: urlMatch[1],
    method,
    headers,
    body,
  };
}

export function buildFetchOptions(parsed, overrides = {}) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(parsed.headers || {})) {
    if (value) headers.set(key, value);
  }

  if (overrides.headers) {
    for (const [key, value] of Object.entries(overrides.headers)) {
      if (value === undefined || value === null || value === '') continue;
      headers.set(key, value);
    }
  }

  const method = (overrides.method || parsed.method || 'GET').toUpperCase();
  const init = {
    method,
    headers,
    redirect: overrides.redirect || 'follow',
    cache: 'no-store',
  };

  const body = overrides.body ?? (parsed.body && method !== 'GET' && method !== 'HEAD' ? parsed.body : undefined);
  if (body !== undefined) {
    init.body = body;
  }

  return init;
}

export async function replayCurl(parsed, overrides = {}) {
  const init = buildFetchOptions(parsed, overrides);
  return fetch(overrides.url || parsed.url, init);
}

export function extractDavEntries(xml, baseUrl) {
  const entries = [];
  const responseRe = /<(?:\w+:)?response>([\s\S]*?)<\/(?:\w+:)?response>/gi;
  for (const responseMatch of xml.matchAll(responseRe)) {
    const chunk = responseMatch[1];
    const hrefMatch = chunk.match(/<(?:\w+:)?href>([\s\S]*?)<\/(?:\w+:)?href>/i);
    if (!hrefMatch) continue;

    const href = hrefMatch[1].trim();
    const absoluteUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
    const pathname = new URL(absoluteUrl).pathname;
    const decodedPathname = decodeURIComponent(pathname);

    const contentLengthMatch = chunk.match(/<(?:\w+:)?getcontentlength>([\s\S]*?)<\/(?:\w+:)?getcontentlength>/i);
    const contentTypeMatch = chunk.match(/<(?:\w+:)?getcontenttype>([\s\S]*?)<\/(?:\w+:)?getcontenttype>/i);
    const etagMatch = chunk.match(/<(?:\w+:)?getetag>([\s\S]*?)<\/(?:\w+:)?getetag>/i);
    const lastModifiedMatch = chunk.match(/<(?:\w+:)?getlastmodified>([\s\S]*?)<\/(?:\w+:)?getlastmodified>/i);
    const fileIdMatch = chunk.match(/<(?:\w+:)?fileid>([\s\S]*?)<\/(?:\w+:)?fileid>/i);
    const hasCollection = /<(?:\w+:)?collection\s*\/?>/i.test(chunk);

    const name = decodedPathname.split('/').filter(Boolean).pop() || decodedPathname;

    entries.push({
      href: absoluteUrl,
      path: decodedPathname,
      name,
      fileId: fileIdMatch?.[1]?.trim() || '',
      contentLength: Number(contentLengthMatch?.[1]?.trim() || 0) || 0,
      contentType: contentTypeMatch?.[1]?.trim() || '',
      etag: etagMatch?.[1]?.trim() || '',
      lastModified: lastModifiedMatch?.[1]?.trim() || '',
      isFolder: hasCollection || decodedPathname.endsWith('/'),
    });
  }

  return entries;
}

export function extractScopePrefix(entries) {
  const firstFile = entries.find((entry) => !entry.isFolder);
  if (!firstFile) return '';
  const marker = '/remote.php/dav/files/';
  const index = firstFile.path.indexOf(marker);
  if (index === -1) return '';
  const after = firstFile.path.slice(index + marker.length);
  const slashIndex = after.indexOf('/');
  if (slashIndex === -1) return '';
  return after.slice(0, slashIndex + 1);
}

export function toLocalRelativePath(entry, scopePrefix = '') {
  const marker = '/remote.php/dav/files/';
  const index = entry.path.indexOf(marker);
  let relative = entry.name;
  if (index !== -1) {
    const after = entry.path.slice(index + marker.length);
    relative = scopePrefix && after.startsWith(scopePrefix) ? after.slice(scopePrefix.length) : after;
  }
  relative = relative.replace(/^\/+/, '');
  return relative || entry.name || 'downloaded-file';
}

export function isBinaryDownload(entry) {
  return !entry.isFolder;
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function safeJoinPosix(base, relative) {
  const normalized = pathPosix.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, '');
  return pathPosix.join(base, normalized);
}
