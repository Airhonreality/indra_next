import { NextResponse, NextRequest } from 'next/server';

const DAEMON_VERSION = process.env.DAEMON_VERSION || '0.1.0';
const RELEASE_URL_BASE = process.env.RELEASE_URL_BASE || 'https://github.com/Airhonreality/indra_next/releases/download';

const RELEASES: Record<string, Record<string, string>> = {
  '0.1.0': {
    'windows-x86_64': $/v0.1.0/indra-desktop-v0.1.0.exe,
    'linux-x86_64': $/v0.1.0/indra-desktop_0.1.0_amd64.deb,
    'linux-aarch64': $/v0.1.0/indra-desktop_0.1.0_aarch64.deb,
    'macos-x86_64': $/v0.1.0/Indra.Desktop.dmg,
    'macos-aarch64': $/v0.1.0/Indra.Desktop.dmg,
  },
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ target: string; arch: string }> }
) {
  try {
    const { target, arch } = await params;
    const key = $-{arch};

    const currentRelease = RELEASES[DAEMON_VERSION];
    if (!currentRelease || !currentRelease[key]) {
      return NextResponse.json(
        { error: 'Platform not supported' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      version: DAEMON_VERSION,
      notes: Indra Desktop Storage v{DAEMON_VERSION},
      pub_date: new Date().toISOString(),
      platforms: {
        [key]: {
          signature: $/v{DAEMON_VERSION}/{key}.sig,
          url: currentRelease[key],
        },
      },
    });
  } catch (error) {
    console.error('[daemon/update] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch update information' },
      { status: 500 }
    );
  }
}
