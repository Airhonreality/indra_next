; Instalador Indra Desktop Storage
; Empaqueta el binario real indra-daemon.exe (compilado con cargo, no un placeholder)

!include "MUI2.nsh"

Name "Indra Desktop Storage v0.1.0"
OutFile "Indra_Desktop_Setup.exe"
InstallDir "$PROGRAMFILES64\Indra Desktop"
InstallDirRegKey HKCU "Software\Indra\Desktop" ""
RequestExecutionLevel admin

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

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Spanish"

Section "Install"
  SetOutPath "$INSTDIR"

  ; Payload real: binario compilado por cargo build --release -p indra-daemon
  File "target\release\indra-daemon.exe"

  ; Uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Accesos directos
  CreateDirectory "$SMPROGRAMS\Indra Desktop"
  CreateShortCut "$SMPROGRAMS\Indra Desktop\Indra Desktop.lnk" "$INSTDIR\indra-daemon.exe"
  CreateShortCut "$SMPROGRAMS\Indra Desktop\Uninstall.lnk" "$INSTDIR\uninstall.exe"

  ; Info de instalación en Registry
  WriteRegStr HKCU "Software\Indra\Desktop" "" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\IndraDesktop" "DisplayName" "Indra Desktop Storage"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\IndraDesktop" "UninstallString" "$INSTDIR\uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\IndraDesktop" "DisplayVersion" "0.1.0"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\IndraDesktop" "Publisher" "Indra Contributors"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\IndraDesktop" "InstallLocation" "$INSTDIR"
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\indra-daemon.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  Delete "$SMPROGRAMS\Indra Desktop\Indra Desktop.lnk"
  Delete "$SMPROGRAMS\Indra Desktop\Uninstall.lnk"
  RMDir "$SMPROGRAMS\Indra Desktop"

  DeleteRegKey HKCU "Software\Indra\Desktop"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\IndraDesktop"
SectionEnd
