#!/bin/bash

# Script para subir binarios compilados a GitHub Releases
# Uso: ./scripts/upload-release.sh v0.1.0

set -e

VERSION=${1:-v0.1.0}
GITHUB_REPO="Airhonreality/indra_next"

echo "📦 Subiendo binarios para $VERSION a GitHub..."

# Ruta de binarios
BINARIES=(
  "daemon-rs/tauri-installer/src-tauri/target/release/bundle/msi/indra-desktop-v0.1.0.exe"
  "daemon-rs/tauri-installer/src-tauri/target/release/bundle/nsis/Indra Desktop_0.1.0_x64-setup.exe"
  "daemon-rs/tauri-installer/src-tauri/target/release/bundle/deb/indra-desktop_0.1.0_amd64.deb"
  "daemon-rs/tauri-installer/src-tauri/target/release/bundle/appimage/indra-desktop-0.1.0.AppImage"
)

# Subir cada binario
for binary in "${BINARIES[@]}"; do
  if [ -f "$binary" ]; then
    echo "⬆️  Subiendo $(basename "$binary")..."
    gh release upload "$VERSION" "$binary" --clobber
  else
    echo "⚠️  No encontrado: $binary"
  fi
done

echo "✅ Binarios subidos a GitHub Releases"
echo "📥 Descargar desde: https://github.com/$GITHUB_REPO/releases/download/$VERSION/"
