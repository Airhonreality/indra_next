# Descargas de Indra Desktop Storage

Este directorio almacena los binarios compilados del daemon Rust que se sirven desde la web app.

## 📦 Archivos Esperados

Los siguientes binarios deben estar aquí para que los descargas funcionen:

```
downloads/
├── indra-desktop-v0.1.0.exe          (145 MB)
├── indra-desktop_0.1.0_amd64.deb     (142 MB)
└── indra-desktop-0.1.0.AppImage      (148 MB)
```

## 🔨 Cómo Compilar y Generar Binarios

### 1. Compilar Tauri Installer (Windows)

```bash
cd c:\Users\javir\Documents\DEVs\indra-daemon-rs\tauri-installer

# Instalar dependencias
npm install

# Build para Windows
npm run tauri build --target msi

# El binario estará en:
# src-tauri/target/release/bundle/msi/indra-desktop-v0.1.0.exe
```

### 2. Compilar para Linux (deb)

```bash
cd c:\Users\javir\Documents\DEVs\indra-daemon-rs\tauri-installer

# Build para Debian/Ubuntu
npm run tauri build --target deb

# El binario estará en:
# src-tauri/target/release/bundle/deb/indra-desktop_0.1.0_amd64.deb
```

### 3. Compilar para Linux (AppImage)

```bash
cd c:\Users\javir\Documents\DEVs\indra-daemon-rs\tauri-installer

# Build para AppImage
npm run tauri build --target appimage

# El binario estará en:
# src-tauri/target/release/bundle/appimage/indra-desktop-0.1.0.AppImage
```

## 📥 Copiar Binarios a Este Directorio

Después de compilar, copia los binarios aquí:

```bash
# Desde Windows
copy "c:\Users\javir\Documents\DEVs\indra-daemon-rs\tauri-installer\src-tauri\target\release\bundle\msi\indra-desktop-v0.1.0.exe" .
copy "c:\Users\javir\Documents\DEVs\indra-daemon-rs\tauri-installer\src-tauri\target\release\bundle\deb\indra-desktop_0.1.0_amd64.deb" .
copy "c:\Users\javir\Documents\DEVs\indra-daemon-rs\tauri-installer\src-tauri\target\release\bundle\appimage\indra-desktop-0.1.0.AppImage" .
```

O manualmente:
1. Navega a cada carpeta de build
2. Copia los binarios
3. Pegalos en este directorio (`public/downloads/`)

## ⚙️ Configuración en CI/CD (GitHub Actions)

Para automatizar la compilación, crea `.github/workflows/release.yml`:

```yaml
name: Build Installers

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
      
      - name: Install Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Build Tauri
        working-directory: indra-daemon-rs/tauri-installer
        run: |
          npm install
          npm run tauri build
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: installers-${{ matrix.os }}
          path: indra-daemon-rs/tauri-installer/src-tauri/target/release/bundle/
```

## 📋 Verificación

Para verificar que los binarios están correctamente servidos:

```bash
# Verificar que el archivo .exe existe
curl -I http://localhost:3000/api/downloads/indra-desktop-v0.1.0.exe

# Descargar verificando checksum
curl -o downloaded.exe http://localhost:3000/api/downloads/indra-desktop-v0.1.0.exe
sha256sum downloaded.exe
```

## 📝 Notas

- Los binarios están versionados (v0.1.0)
- Se sirven con cachés de 24h
- Se validan checksums SHA256
- Solo se permiten archivos en whitelist (seguridad)
- Los tamaños son aproximados (varían con compilación)

## 🚀 Próximos Pasos

1. Compilar los binarios Rust
2. Copiar a `public/downloads/`
3. Ejecutar `npm run dev` 
4. Visita `http://localhost:3000/downloads`
5. Descarga y prueba!
