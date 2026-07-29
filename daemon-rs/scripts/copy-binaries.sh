#!/bin/bash

# Script para copiar binarios compilados a la web app
# Uso: ./scripts/copy-binaries.sh

set -e

WEB_APP_DIR="c:\Users\javir\Documents\DEVs\indra-next-sovereign_A"
DAEMON_DIR="c:\Users\javir\Documents\DEVs\indra-daemon-rs"
DOWNLOADS_DIR="$WEB_APP_DIR/public/downloads"

echo "🔨 Copiando binarios compilados a web app..."
echo ""

# Crear directorio si no existe
mkdir -p "$DOWNLOADS_DIR"

# Windows .exe
if [ -f "$DAEMON_DIR/tauri-installer/src-tauri/target/release/bundle/msi/indra-desktop-v0.1.0.exe" ]; then
  echo "✅ Copiando Windows .exe..."
  cp "$DAEMON_DIR/tauri-installer/src-tauri/target/release/bundle/msi/indra-desktop-v0.1.0.exe" "$DOWNLOADS_DIR/"
else
  echo "⚠️  Windows .exe no encontrado. Ejecuta: cd tauri-installer && npm run tauri build --target msi"
fi

# Linux .deb
if [ -f "$DAEMON_DIR/tauri-installer/src-tauri/target/release/bundle/deb/indra-desktop_0.1.0_amd64.deb" ]; then
  echo "✅ Copiando Linux .deb..."
  cp "$DAEMON_DIR/tauri-installer/src-tauri/target/release/bundle/deb/indra-desktop_0.1.0_amd64.deb" "$DOWNLOADS_DIR/"
else
  echo "⚠️  Linux .deb no encontrado. Ejecuta: cd tauri-installer && npm run tauri build --target deb"
fi

# Linux AppImage
if [ -f "$DAEMON_DIR/tauri-installer/src-tauri/target/release/bundle/appimage/indra-desktop-0.1.0.AppImage" ]; then
  echo "✅ Copiando Linux AppImage..."
  cp "$DAEMON_DIR/tauri-installer/src-tauri/target/release/bundle/appimage/indra-desktop-0.1.0.AppImage" "$DOWNLOADS_DIR/"
else
  echo "⚠️  Linux AppImage no encontrado. Ejecuta: cd tauri-installer && npm run tauri build --target appimage"
fi

echo ""
echo "✨ Binarios copiados a: $DOWNLOADS_DIR"
echo ""
echo "Ahora ejecuta:"
echo "  cd $WEB_APP_DIR"
echo "  npm run dev"
echo ""
echo "Y accede a: http://localhost:3000/downloads"
