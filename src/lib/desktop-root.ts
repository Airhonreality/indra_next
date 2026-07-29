import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DESKTOP_ROOT_DIRNAME = 'Indra Drive';
export const DESKTOP_ROOT_METADATA_FILE = '.indra-drive.json';
export const DESKTOP_ROOT_SUBDIRECTORIES = ['incoming', 'cache', 'thumbnails'] as const;

export type DesktopRootMetadata = {
  version: 1;
  userId: string;
  createdAt: string;
  updatedAt: string;
  subdirectories: string[];
};

export type DesktopRootState = {
  path: string;
  exists: boolean;
  ready: boolean;
  metadata: DesktopRootMetadata | null;
  subdirectories: Array<{
    name: string;
    path: string;
    exists: boolean;
  }>;
};

export function resolveDesktopRootPath(userId: string): string {
  const configuredRootPath = getConfiguredDesktopRootPath();
  if (configuredRootPath) {
    return configuredRootPath;
  }

  return path.join(os.homedir(), DESKTOP_ROOT_DIRNAME, sanitizeSegment(userId));
}

export async function readDesktopRootState(userId: string): Promise<DesktopRootState> {
  const rootPath = resolveDesktopRootPath(userId);
  const exists = await pathExists(rootPath);
  const metadataPath = path.join(rootPath, DESKTOP_ROOT_METADATA_FILE);
  const metadata = exists ? await readMetadata(metadataPath) : null;

  const subdirectories = await Promise.all(
    DESKTOP_ROOT_SUBDIRECTORIES.map(async (name) => {
      const subdirectoryPath = path.join(rootPath, name);
      return {
        name,
        path: subdirectoryPath,
        exists: await pathExists(subdirectoryPath),
      };
    })
  );

  return {
    path: rootPath,
    exists,
    ready: Boolean(
      exists &&
        metadata &&
        DESKTOP_ROOT_SUBDIRECTORIES.every((name) =>
          subdirectories.some((subdirectory) => subdirectory.name === name && subdirectory.exists)
        )
    ),
    metadata,
    subdirectories,
  };
}

export async function ensureDesktopRoot(userId: string): Promise<DesktopRootState> {
  const rootPath = resolveDesktopRootPath(userId);
  const now = new Date().toISOString();

  await fs.mkdir(rootPath, { recursive: true });

  await Promise.all(
    DESKTOP_ROOT_SUBDIRECTORIES.map((name) => fs.mkdir(path.join(rootPath, name), { recursive: true }))
  );

  const metadataPath = path.join(rootPath, DESKTOP_ROOT_METADATA_FILE);
  const nextMetadata = await readMetadata(metadataPath);
  const metadata: DesktopRootMetadata = {
    version: 1,
    userId,
    createdAt: nextMetadata?.createdAt ?? now,
    updatedAt: now,
    subdirectories: [...DESKTOP_ROOT_SUBDIRECTORIES],
  };

  await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  return readDesktopRootState(userId);
}

async function readMetadata(metadataPath: string): Promise<DesktopRootMetadata | null> {
  try {
    const raw = await fs.readFile(metadataPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DesktopRootMetadata>;
    if (!parsed || parsed.version !== 1 || typeof parsed.userId !== 'string') {
      return null;
    }

    return {
      version: 1,
      userId: parsed.userId,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date(0).toISOString(),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
      subdirectories: Array.isArray(parsed.subdirectories)
        ? parsed.subdirectories.filter((item): item is string => typeof item === 'string')
        : [...DESKTOP_ROOT_SUBDIRECTORIES],
    };
  } catch {
    return null;
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function sanitizeSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_') || 'user';
}

function getConfiguredDesktopRootPath(): string | null {
  const configuredRootPath = process.env.INDRA_DESKTOP_ROOT_PATH?.trim();
  if (!configuredRootPath) {
    return null;
  }

  return path.isAbsolute(configuredRootPath)
    ? configuredRootPath
    : path.resolve(configuredRootPath);
}
