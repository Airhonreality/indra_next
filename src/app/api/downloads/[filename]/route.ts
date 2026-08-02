import { NextResponse } from 'next/server';

// Redireccionar descargas a GitHub Releases
const GITHUB_RELEASES_URL = 'https://github.com/Airhonreality/indra_next/releases/download/v0.1.0';

const DOWNLOADS: Record<string, string> = {
  'indra-desktop-v0.1.0.exe': 'Indra_Desktop_Setup.exe',
  'indra-desktop_0.1.0_amd64.deb': 'indra-desktop_0.1.0_amd64.deb',
  'indra-desktop-0.1.0.AppImage': 'Indra_Desktop_0.1.0_amd64.AppImage',
};

export async function GET(
  _request: Request,
  { params }: { params: { filename: string } }
) {
  const { filename } = params;

  // Encontrar el archivo en GitHub Releases
  const githubFilename = DOWNLOADS[filename];

  if (!githubFilename) {
    return NextResponse.json(
      { error: 'File not found' },
      { status: 404 }
    );
  }

  // Redireccionar a GitHub Releases
  const downloadUrl = `${GITHUB_RELEASES_URL}/${githubFilename}`;

  return NextResponse.redirect(downloadUrl, 302);
}
