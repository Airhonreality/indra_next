# Indra Desktop Storage — Setup de Descargas

## 📋 Resumen

El instalador es ahora descargable desde la web app de Indra en `/downloads` como un archivo `.exe` normal.

**Flujo del usuario:**
```
1. Abre http://localhost:3000/downloads
2. Click en "Descargar Windows .exe"
3. Ejecuta indra-desktop-v0.1.0.exe
4. Sigue el asistente
5. ✓ Daemon instalado y corriendo
```

---

## 🔨 Paso 1: Compilar los Binarios Rust

### Windows .exe

```bash
cd c:\Users\javir\Documents\DEVs\indra-daemon-rs\tauri-installer

# Instalar dependencias (primera vez)
npm install

# Compilar para Windows MSI/EXE
npm run tauri build

# Genera: src-tauri/target/release/bundle/msi/indra-desktop-v0.1.0.exe
```

### Linux .deb

```bash
cd tauri-installer

# Compilar para Debian/Ubuntu
npm run tauri build --target deb

# Genera: src-tauri/target/release/bundle/deb/indra-desktop_0.1.0_amd64.deb
```

### Linux AppImage

```bash
cd tauri-installer

# Compilar para AppImage
npm run tauri build --target appimage

# Genera: src-tauri/target/release/bundle/appimage/indra-desktop-0.1.0.AppImage
```

---

## 📥 Paso 2: Copiar Binarios a la Web App

### Opción A: Automático (script)

```bash
cd c:\Users\javir\Documents\DEVs\indra-daemon-rs

# Windows PowerShell
./scripts/copy-binaries.sh

# O Linux/macOS
bash scripts/copy-binaries.sh
```

### Opción B: Manual

Copia los binarios compilados a:
```
c:\Users\javir\Documents\DEVs\indra-next-sovereign_A\public\downloads\
```

Archivos que deben estar ahí:
```
public/downloads/
├── indra-desktop-v0.1.0.exe          (145 MB)
├── indra-desktop_0.1.0_amd64.deb     (142 MB)
└── indra-desktop-0.1.0.AppImage      (148 MB)
```

---

## 🚀 Paso 3: Iniciar la Web App

```bash
cd c:\Users\javir\Documents\DEVs\indra-next-sovereign_A

# Instalar dependencias (primera vez)
npm install

# Iniciar servidor de desarrollo
npm run dev

# Abre: http://localhost:3000/downloads
```

---

## ✅ Paso 4: Verificar Descargas

Abre tu navegador en:
```
http://localhost:3000/downloads
```

Deberías ver:
```
┌─────────────────────────────────┐
│  Descargar Indra Desktop        │
│                                 │
│  🪟 Windows (10/11)             │
│     [Descargar 145 MB] ← Click  │
│                                 │
│  🐧 Linux (Ubuntu/Debian)       │
│     [Descargar 142 MB]          │
│                                 │
│  🐧 Linux (AppImage)            │
│     [Descargar 148 MB]          │
└─────────────────────────────────┘
```

---

## 🎯 Flujo Completo: Usuario Final

### Usuario descarga e instala:

**Windows:**
```
1. Visita http://localhost:3000/downloads (o en producción: https://indra.app/downloads)
2. Click "Descargar Windows .exe"
3. Ejecuta indra-desktop-v0.1.0.exe
4. Instalador guía el proceso
5. Daemon se inicia automáticamente
```

**Linux:**
```
1. Visita http://localhost:3000/downloads
2. Click "Descargar Linux .deb"
3. sudo apt install ./indra-desktop_0.1.0_amd64.deb
4. O: click "AppImage" → ./indra-desktop-0.1.0.AppImage
5. Daemon se inicia automáticamente
```

---

## 🔧 Estructura de la API

### GET /api/downloads
Retorna lista de binarios disponibles:
```json
{
  "version": "0.1.0",
  "artifacts": {
    "indra-desktop-v0.1.0.exe": {
      "name": "Indra Desktop Windows",
      "platform": "windows",
      "arch": "x86_64",
      "size": "145 MB",
      "checksum": "3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a"
    },
    ...
  }
}
```

### GET /api/downloads/[filename]
Descarga el binario:
```bash
curl -O http://localhost:3000/api/downloads/indra-desktop-v0.1.0.exe
```

Headers:
- `Content-Disposition: attachment; filename="indra-desktop-v0.1.0.exe"`
- `X-SHA256-Checksum: 3f4a5b6c...` (para verificación)

### HEAD /api/downloads/[filename]
Verifica sin descargar:
```bash
curl -I http://localhost:3000/api/downloads/indra-desktop-v0.1.0.exe
# 200 OK
# Content-Length: 152100000
```

---

## 🔐 Seguridad

- ✅ Solo archivos en whitelist se sirven
- ✅ Checksums SHA256 incluidos
- ✅ Cache de 24h (para production)
- ✅ Validación de path (no directory traversal)

---

## 📊 Monitoreo de Descargas (Opcional)

Los binarios se descargados se registran en logs:
```
[downloads] User downloaded: indra-desktop-v0.1.0.exe
```

Para analytics en production, puedes:
1. Usar Google Analytics
2. Webhooks a tu backend
3. Event tracking en Mixpanel

---

## 🚨 Troubleshooting

### Problema: "File not available yet"

**Causa:** Los binarios no están en `public/downloads/`

**Solución:**
1. Compila: `npm run tauri build`
2. Copia binarios: `./scripts/copy-binaries.sh`
3. Reinicia: `npm run dev`

### Problema: Checksum no coincide

**Causa:** El archivo se descargó incompleto o corrupto

**Solución:**
```bash
# Verifica checksum
sha256sum indra-desktop-v0.1.0.exe
# Compara con: X-SHA256-Checksum header

# O calcula desde API
curl -I http://localhost:3000/api/downloads/indra-desktop-v0.1.0.exe | grep Checksum
```

### Problema: Descarga lenta

**Solución:**
- Es normal la primera descarga (binario es 140-150 MB)
- Con cache de 24h, descargas posteriores son más rápidas
- En producción, usar CDN (CloudFront, BunnyCDN, etc)

---

## 🌍 Producción (Deployment)

En producción (indra.app):

1. **Compilar binarios en CI/CD:**
   ```yaml
   # .github/workflows/release.yml
   - Run: npm run tauri build
   - Upload: ./src-tauri/target/release/bundle/
   ```

2. **Subir a CDN:**
   ```bash
   aws s3 cp --recursive bundle/ s3://indra-downloads-cdn/
   ```

3. **Actualizar URLs:**
   - En `src/app/api/downloads/route.ts`:
   ```ts
   const CDN_URL = 'https://cdn.indra.app/downloads';
   ```

4. **Cachear en CDN:**
   - Configurar CloudFront/BunnyCDN para cache 30 días
   - Invalidate cache en cada release

---

## 📝 Checklist

- [ ] Compilar binarios Rust (`npm run tauri build`)
- [ ] Copiar a `public/downloads/`
- [ ] Iniciar web app (`npm run dev`)
- [ ] Verificar `/downloads` en navegador
- [ ] Probar descarga de cada archivo
- [ ] Verificar checksum SHA256
- [ ] Probar instalación en Windows
- [ ] Probar instalación en Linux (.deb y AppImage)
- [ ] Verificar daemon se inicia automáticamente

---

**¡Listo! Tu instalador está descargable desde la web.** 🎉
