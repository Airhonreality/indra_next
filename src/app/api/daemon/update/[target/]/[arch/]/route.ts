import { NextResponse } from 'next/server';

// Versión actual del daemon
// Se actualiza automáticamente con git tags
const DAEMON_VERSION = process.env.DAEMON_VERSION || '0.1.0';
const RELEASE_URL_BASE = process.env.RELEASE_URL_BASE || 'https://github.com/Airhonreality/indra_next/releases/download';

// Mapeo de versiones y URLs
const RELEASES: Record<string, Record<string, string>> = {
  '0.1.0': {
    'windows-x86_64': `${RELEASE_URL_BASE}/v0.1.0/indra-desktop-v0.1.0.exe`,
    'linux-x86_64': `${RELEASE_URL_BASE}/v0.1.0/indra-desktop_0.1.0_amd64.deb`,
    'linux-aarch64': `${RELEASE_URL_BASE}/v0.1.0/indra-desktop_0.1.0_aarch64.deb`,
    'macos-x86_64': `${RELEASE_URL_BASE}/v0.1.0/Indra.Desktop.dmg`,
    'macos-aarch64': `${RELEASE_URL_BASE}/v0.1.0/Indra.Desktop.dmg`,
  },
  // v0.1.1 vendrá aquí cuando se compile
  // '0.1.1': {
  //   'windows-x86_64': `${RELEASE_URL_BASE}/v0.1.1/indra-desktop-v0.1.1.exe`,
  //   ...
  // }
};

export async function GET(
  _request: Request,
  { params }: { params: { target: string; arch: string } }
) {
  try {
    const { target, arch } = params;
    const key = `${target}-${arch}`;

    // Verificar si existe actualización
    const currentRelease = RELEASES[DAEMON_VERSION];
    if (!currentRelease || !currentRelease[key]) {
      return NextResponse.json(
        { error: 'Platform not supported' },
        { status: 404 }
      );
    }

    // Retornar información de actualización en formato Tauri
    return NextResponse.json({
      version: DAEMON_VERSION,
      notes: `Indra Desktop Storage v${DAEMON_VERSION}\n\nCaracterísticas:\n- FastCDC chunking inteligente\n- Sincronización <5s en LAN\n- Soporte multi-dispositivo\n- Encriptación end-to-end`,
      pub_date: new Date().toISOString(),
      platforms: {
        [key]: {
          signature: `${RELEASE_URL_BASE}/v${DAEMON_VERSION}/${key}.sig`,
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
