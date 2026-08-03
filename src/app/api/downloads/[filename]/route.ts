import { NextResponse, NextRequest } from 'next/server';

const GITHUB_RELEASES_URL = 'https://github.com/Airhonreality/indra_next/releases/download/v0.1.0';

const DOWNLOADS: Record<string, string> = {
  'indra-desktop-v0.1.0.exe': 'Indra_Desktop_Setup.exe',
  'indra-desktop_0.1.0_amd64.deb': 'indra-desktop_0.1.0_amd64.deb',
  'indra-desktop-0.1.0.AppImage': 'Indra_Desktop_0.1.0_amd64.AppImage',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  const githubFilename = DOWNLOADS[filename];

  if (!githubFilename) {
    return NextResponse.json(
      { error: 'File not found' },
      { status: 404 }
    );
  }

  const downloadUrl = `${GITHUB_RELEASES_URL}/${githubFilename}`;

  return NextResponse.json({
    url: downloadUrl,
    filename: githubFilename
  });
}
