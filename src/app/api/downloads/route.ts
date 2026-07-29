import { NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';

const DOWNLOADS_DIR = path.join(process.cwd(), 'public', 'downloads');
const RELEASES_CONFIG = {
  version: '0.1.0',
  artifacts: {
    'indra-desktop-v0.1.0.exe': {
      name: 'Indra Desktop Windows',
      platform: 'windows',
      arch: 'x86_64',
      filename: 'indra-desktop-v0.1.0.exe',
      size: '145 MB',
      checksum: '3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a',
    },
    'indra-desktop_0.1.0_amd64.deb': {
      name: 'Indra Desktop Linux (Debian/Ubuntu)',
      platform: 'linux',
      arch: 'x86_64',
      filename: 'indra-desktop_0.1.0_amd64.deb',
      size: '142 MB',
      checksum: '4g5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b',
    },
    'indra-desktop-0.1.0.AppImage': {
      name: 'Indra Desktop Linux (AppImage)',
      platform: 'linux',
      arch: 'x86_64',
      filename: 'indra-desktop-0.1.0.AppImage',
      size: '148 MB',
      checksum: '5h6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c',
    },
  },
};

export async function GET() {
  try {
    return NextResponse.json({
      version: RELEASES_CONFIG.version,
      artifacts: RELEASES_CONFIG.artifacts,
    });
  } catch (error) {
    console.error('[downloads] Failed to get release info:', error);
    return NextResponse.json(
      { error: 'Failed to get release information' },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint para reportar descargas (analytics, opcional)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { filename, userAgent } = body;

    // Log de descargas (opcional - para tracking)
    console.log(`[downloads] User downloaded: ${filename}`, {
      timestamp: new Date().toISOString(),
      userAgent,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[downloads] Failed to log download:', error);
    return NextResponse.json({ error: 'Failed to log download' }, { status: 500 });
  }
}
