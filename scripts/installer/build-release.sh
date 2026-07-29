#!/bin/bash

set -e

VERSION=$(jq -r '.version' package.json)
BUILD_DIR="dist/indra-desktop-v${VERSION}"

echo "Building Indra Desktop Storage v${VERSION}..."

# Limpiar
rm -rf dist

# Crear estructura de distribución
mkdir -p "$BUILD_DIR"/{app,scripts,docs}

# Copiar archivos esenciales
cp -r .next "$BUILD_DIR/app/"
cp -r public "$BUILD_DIR/app/"
cp -r node_modules "$BUILD_DIR/app/"
cp package.json "$BUILD_DIR/app/"
cp package-lock.json "$BUILD_DIR/app/"

# Copiar instaladores
cp scripts/installer/setup.bat "$BUILD_DIR/"
cp scripts/installer/setup.sh "$BUILD_DIR/"
chmod +x "$BUILD_DIR/setup.sh"

# Copiar documentación
cp SETUP.md "$BUILD_DIR/"
cp README.md "$BUILD_DIR/"

echo "✅ Build complete: $BUILD_DIR/"
echo ""
echo "Distribute to users:"
echo "  Windows: indra-desktop-v${VERSION}/setup.bat"
echo "  macOS/Linux: indra-desktop-v${VERSION}/setup.sh"
