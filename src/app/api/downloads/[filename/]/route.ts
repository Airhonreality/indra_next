import { NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';
import crypto from 'crypto';

const DOWNLOADS_DIR = path.join(process.cwd(), 'public', 'downloads');

// Whitelist de archivos permitidos
const ALLOWED_FILES = [
  'indra-desktop-v0.1.0.exe',
  'indra-desktop_0.1.0_amd64.deb',
  'indra-desktop-0.1.0.AppImage',
];

// Content types
const CONTENT_TYPES: Record<string, string> = {
  '.exe': 'application/octet-stream',
  '.deb': 'application/octet-stream',
  '.AppImage': 'application/octet-stream',
  '.dmg': 'application/octet-stream',
};

export async function GET(
  _request: Request,
  { params }: { params: { filename: string } }
) {
  try {
    const { filename } = params;

    // Validar que el archivo está en la whitelist
    if (!ALLOWED_FILES.includes(filename)) {
      return NextResponse.json(
        { error: 'File not found or not allowed' },
        { status: 404 }
      );
    }

    const filePath = path.join(DOWNLOADS_DIR, filename);

    // Verificar que el archivo existe
    try {
      await fs.access(filePath);
    } catch {
      return NextResponse.json(
        { error: 'Download file not available yet. Please try again later.' },
        { status: 503 }
      );
    }

    // Leer el archivo
    const fileBuffer = await fs.readFile(filePath);

    // Calcular checksum SHA256
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Determinar content type
    const ext = path.extname(filename);
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

    // Retornar archivo con headers apropiados
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileBuffer.length.toString(),
        'X-SHA256-Checksum': checksum,
        'Cache-Control': 'public, max-age=86400', // Cache 24h
      },
    });
  } catch (error) {
    console.error('[downloads] Failed to serve file:', error);
    return NextResponse.json(
      { error: 'Failed to download file' },
      { status: 500 }
    );
  }
}

/**
 * HEAD request para verificar si el archivo existe sin descargar
 */
export async function HEAD(
  _request: Request,
  { params }: { params: { filename: string } }
) {
  try {
    const { filename } = params;

    if (!ALLOWED_FILES.includes(filename)) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    const filePath = path.join(DOWNLOADS_DIR, filename);

    try {
      const stats = await fs.stat(filePath);
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Content-Length': stats.size.toString(),
          'Content-Type': CONTENT_TYPES[path.extname(filename)] || 'application/octet-stream',
        },
      });
    } catch {
      return NextResponse.json(
        { error: 'File not available' },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error('[downloads] HEAD request failed:', error);
    return NextResponse.json(
      { error: 'Failed to check file' },
      { status: 500 }
    );
  }
}
