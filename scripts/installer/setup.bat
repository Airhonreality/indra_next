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
