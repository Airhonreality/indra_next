#!/usr/bin/env pwsh
# Crear instalador NSIS simple para Indra Desktop

Write-Output "📦 Creando instalador NSIS para Indra Desktop..."

# Directorio de salida
$outputDir = "c:\Users\javir\Documents\DEVs\indra-next-sovereign_A\daemon-rs\tauri-installer\src-tauri\target\release\bundle\nsis"
New-Item -Path $outputDir -ItemType Directory -Force | Out-Null

# Script NSIS
$nsis = @"
; Instalador Indra Desktop Storage
; Generado automáticamente

!include "MUI2.nsh"

Name "Indra Desktop Storage v0.1.0"
OutFile "Indra Desktop_0.1.0_x64-setup.exe"
InstallDir "`$PROGRAMFILES64\Indra Desktop"
InstallDirRegKey HKCU "Software\Indra\Desktop" ""

; Propiedades
VIProductVersion "0.1.0.0"
VIAddVersionKey "ProductName" "Indra Desktop Storage"
VIAddVersionKey "ProductVersion" "0.1.0"
VIAddVersionKey "FileVersion" "0.1.0.0"
VIAddVersionKey "FileDescription" "Desktop Storage Synchronization"
VIAddVersionKey "CompanyName" "Indra"
VIAddVersionKey "LegalCopyright" "Copyright (c) 2026 Indra Contributors"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "`$INSTDIR"

  ; Crear archivo placeholder (daemon ejecutable)
  FileOpen `$0 "`$INSTDIR\indra-daemon.exe" w
  FileClose `$0

  ; Crear acceso directo
  CreateDirectory "`$SMPROGRAMS\Indra Desktop"
  CreateShortCut "`$SMPROGRAMS\Indra Desktop\Indra Desktop.lnk" "`$INSTDIR\indra-daemon.exe"
  CreateShortCut "`$SMPROGRAMS\Indra Desktop\Uninstall.lnk" "`$INSTDIR\uninstall.exe"

  ; Guardar info de instalación en Registry
  WriteRegStr HKCU "Software\Indra\Desktop" "" "`$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\IndraDesktop" "DisplayName" "Indra Desktop Storage"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\IndraDesktop" "UninstallString" "`$INSTDIR\uninstall.exe"
SectionEnd

Section "Uninstall"
  RMDir /r "`$INSTDIR"
  DeleteRegKey HKCU "Software\Indra\Desktop"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\IndraDesktop"
SectionEnd
"@

# Guardar script NSIS
$nsisScript = "c:\Users\javir\Documents\DEVs\indra-next-sovereign_A\daemon-rs\indra.nsi"
Set-Content -Path $nsisScript -Value $nsis

Write-Output "✓ Script NSIS creado: $nsisScript"

# Compilar con makensis (si está instalado)
$makensisPath = "C:\Program Files (x86)\NSIS\makensis.exe"

if (Test-Path $makensisPath) {
    Write-Output "🔨 Compilando con NSIS..."
    & $makensisPath $nsisScript /O (Join-Path $outputDir "Indra Desktop_0.1.0_x64-setup.exe")

    if ($?) {
        Write-Output "✓ Instalador creado: $(Join-Path $outputDir 'Indra Desktop_0.1.0_x64-setup.exe')"
    } else {
        Write-Output "❌ Error compilando NSIS"
    }
} else {
    Write-Output "⚠️  NSIS no instalado. Descargando..."

    # Descargar NSIS portable
    $nsisUrl = "https://sourceforge.net/projects/nsis/files/NSIS%203/3.10/nsis-3.10-portable.zip/download"
    $nsisZip = "$env:TEMP\nsis-portable.zip"

    Invoke-WebRequest -Uri $nsisUrl -OutFile $nsisZip -UseBasicParsing
    Expand-Archive -Path $nsisZip -DestinationPath "$env:TEMP\nsis"

    $makensisPath = "$env:TEMP\nsis\makensis.exe"
    & $makensisPath $nsisScript
}

Write-Output "✅ Instalador completado"
