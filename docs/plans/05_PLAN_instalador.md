---
plan: 05_PLAN_instalador
estado: LISTO
ejecutor: codex
depende_de: [06, 03, 04]
---

# 05 - Instalador + Esquema de Distribución

## Contexto

Hoy el repositorio es:
- Una web app Next.js que corre en `localhost:3000`
- Un cliente desktop que es la misma web app (PWA fallida o tab del navegador)

Lo que se necesita:
- Un instalador rápido que prepare el usuario para usar Indra Desktop Storage
- Esquema claro de cómo distribuir esto (qué artefactos se crean, dónde se guardan)

Este plan NO implementa un Electron app completo (eso es trabajo posterior). En su lugar:

1. Define el **instalador mínimo** (script o batch)
2. Documenta el **árbol de distribución** esperado
3. Crea **instrucciones de setup** para usuarios
4. Prepara el código para empaquetamiento futuro (Tauri, Electron, etc)

## Objetivo

Que un usuario nuevo pueda:
```
1. Descargar instalador
2. Ejecutar setup.sh / setup.bat
3. App abre, login, raíz se crea automáticamente
4. Usuario ve "Listo para usar" en DesktopPanel
```

Sin necesidad de:
- `npm install`
- `npm run dev`
- Conocer Next.js
- Entender qué es PWA

## Operaciones

### 1. Crear instalador para Windows

Archivo: `scripts/installer/setup.bat` (Windows)

```batch
@echo off
setlocal enabledelayedexpansion

echo Indra Desktop Storage Setup
echo ============================
echo.

REM Verificar Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js no encontrado. Instala desde https://nodejs.org/
    exit /b 1
)

REM Verificar si ya existe node_modules
if not exist "node_modules" (
    echo Instalando dependencias...
    call npm install
    if errorlevel 1 (
        echo ERROR: No se pudo instalar dependencias
        exit /b 1
    )
)

REM Verificar build
if not exist ".next" (
    echo Compilando aplicacion...
    call npm run build
    if errorlevel 1 (
        echo ERROR: No se pudo compilar
        exit /b 1
    )
)

REM Crear carpeta de datos si no existe
if not exist "%APPDATA%\IndraStorage" (
    mkdir "%APPDATA%\IndraStorage"
)

echo.
echo Setup completado exitosamente!
echo.
echo Para iniciar la aplicacion:
echo   npm run start
echo.
echo La aplicacion abrira en http://localhost:3000
echo.
pause
```

### 2. Crear instalador para Linux/macOS

Archivo: `scripts/installer/setup.sh`

```bash
#!/bin/bash

echo "Indra Desktop Storage Setup"
echo "============================"
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js no encontrado. Instala desde https://nodejs.org/"
    exit 1
fi

# Instalar dependencias
if [ ! -d "node_modules" ]; then
    echo "Instalando dependencias..."
    npm install
    if [ $? -ne 0 ]; then
        echo "ERROR: No se pudo instalar dependencias"
        exit 1
    fi
fi

# Compilar
if [ ! -d ".next" ]; then
    echo "Compilando aplicacion..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "ERROR: No se pudo compilar"
        exit 1
    fi
fi

# Crear carpeta de datos
mkdir -p "$HOME/.local/share/indra-storage"

echo ""
echo "Setup completado exitosamente!"
echo ""
echo "Para iniciar la aplicacion:"
echo "  npm run start"
echo ""
echo "La aplicacion abrira en http://localhost:3000"
echo ""
```

### 3. Crear archivo de requisitos

Archivo: `SETUP.md`

```markdown
# Indra Desktop Storage — Setup Rápido

## Requisitos

- **Node.js 18+** ([Descargar](https://nodejs.org/))
- **npm 9+** (incluido con Node.js)
- **Windows 10+**, **macOS 10.15+**, o **Linux** (Ubuntu 20.04+)
- Mínimo 2GB de espacio libre en disco
- Conexión a internet (para login y sincronización)

## Instalación

### Windows
```
setup.bat
```

### macOS / Linux
```
chmod +x scripts/installer/setup.sh
./scripts/installer/setup.sh
```

## Iniciar Aplicación

```
npm run start
```

La aplicación abrirá automáticamente en http://localhost:3000

## Primeros Pasos

1. **Login**: Ingresa tus credenciales Indra
2. **Conectar Storage**: Agrega Google Drive, R2, OneDrive, etc
3. **Ver Raíz Local**: Ve a "Estado de escritorio" para ver dónde se guardan los archivos
4. **Navega el Explorador**: Visualiza tus almacenamientos conectados

## Solución de Problemas

### Node.js no encontrado
Instala desde https://nodejs.org/ (recomendado: LTS)

### npm install falla
```
npm cache clean --force
npm install
```

### Puerto 3000 ya está en uso
```
PORT=3001 npm run start
```

### Ver logs detallados
```
DEBUG=* npm run start
```

## Ubicación de Datos

- **Windows**: `C:\\Users\\<usuario>\\Indra Drive\\<user-id>`
- **macOS**: `/Users/<usuario>/Indra Drive/<user-id>`
- **Linux**: `/home/<usuario>/Indra Drive/<user-id>`

Carpetas internas:
- `incoming/`: Archivos listos para subir
- `cache/`: Cache local de metadatos
- `thumbnails/`: Miniaturas de preview
```

### 4. Crear script de distribución (build artefactos)

Archivo: `scripts/installer/build-release.sh`

```bash
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
```

### 5. Crear página de onboarding post-setup

Archivo: `src/app/onboarding/page.tsx`

Una página simple que aparezca cuando el usuario login por primera vez:

```
[Bienvenida a Indra Desktop Storage]

✅ Raíz local creada
ℹ️ Ubicación: ~/Indra Drive/...

Próximos pasos:
1. Conectar tus storages (Google Drive, R2, etc)
2. Ver archivos en el Explorador
3. Empezar a sincronizar

[Ir a Conexiones] [Ir al Explorador]
```

## Prohibiciones

- No instalar dependencias de desarrollo en release
- No incluir archivos de .env o secretos
- No empaquetar node_modules directamente (es pesado)
- No hacer download de dependencias en tiempo de runtime

## Verificación

Criterio:
```
✅ scripts/installer/setup.bat funciona en Windows
✅ scripts/installer/setup.sh funciona en macOS/Linux
✅ npm run start abre la app en localhost:3000
✅ Usuario puede hacer login sin pasos adicionales
✅ DesktopPanel muestra "Raíz local lista" después de login
✅ build-release.sh crea estructura de distribución válida
```

## Resultado esperado

Documento con:
- Instaladores creados (setup.bat, setup.sh)
- SETUP.md completado
- Script de build-release funcional
- Página de onboarding implementada
- Instrucciones de distribución claras
- Confirmación de que nuevo usuario puede: instalar → login → usar sin intervención
