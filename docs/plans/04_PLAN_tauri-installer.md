---
plan: 04_PLAN_tauri-installer
estado: PENDIENTE
ejecutor: TBD
depende_de: [19]
---

# 04 - Instalador Tauri + Distribution

## Contexto

El cliente desktop (Plan 19) requiere una distribucion y mecanismo de instalacion que permita:

- Empaquetamiento cruzado (Windows MSI, Linux deb/snap/AppImage, macOS dmg como stretch goal).
- Instalacion del daemon en servicios del sistema operativo.
- Integracion nativa post-instalacion (carpeta de usuario, registro de servicio).
- Experiencia unificada desde descarga hasta launch.

La referencia tecnica es `docs/research/Local drive integration.md.txt`, seccion Fase 5 de instalacion y distribucion.

## Objetivo real

Construir un instalador multiplataforma (Tauri + Rust backend) que:

1. Presente una interfaz de bienvenida y configuracion.
2. Descargue y registre el daemon del sistema.
3. Cree la estructura de carpetas y metadatos locales.
4. Inicie el servicio automaticamente.
5. Permita desinstalacion limpia y rollback en caso de error.

## Secuencia del trabajo

La siguiente lane se ordena asi:

1. Crear la aplicacion Tauri base con React UI.
2. Implementar los instaladores por plataforma.
3. Agregar operaciones de gestion de daemon y ventanas.
4. Agregar tests y verificacion en CI.
5. Entregar artefactos finales.

## Operaciones

### Fase 1 - Tauri App (tauri-installer crate)

1. Crear el workspace de Tauri.
   - Crate Rust backend con funciones de instalacion.
   - React frontend para UI.
   - Configuracion de Tauri (tauri.conf.json).

2. Pantalla de bienvenida.
   - Logo y descripcion de Indra Drive.
   - Validacion de requisitos del sistema.
   - Botones: Siguiente, Cancelar.

3. Configuracion.
   - Campo de nombre del dispositivo.
   - Selector de ruta de almacenamiento.
   - Validacion de permisos de carpeta.
   - Preview de la estructura que se creara.

4. Progreso de instalacion.
   - Descarga del daemon.
   - Validacion de integridad (checksums).
   - Instalacion del servicio.
   - Registro de componentes nativos (COM DLL en Windows).
   - Barra de progreso y log de operaciones.

5. Pantalla de exito.
   - Confirmacion de instalacion completada.
   - Opciones: Abrir UI, Cerrar, Crear acceso directo en escritorio.
   - Informacion de como acceder al servicio.

6. Stack tecnico.
   - Rust (Tauri backend): descargas, integracion con sistema operativo, manejo de errores.
   - React (frontend): UI responsiva, gestores de estado.
   - TypeScript para type safety.

### Fase 2 - Windows MSI

1. Descarga del daemon.
   - Endpoint de descarga desde CDN o servidor propio.
   - Validacion de checksums SHA256.
   - Fallback a endpoint alternativo si falla el primero.

2. Instalacion como Windows Service.
   - Crear servicio con `sc.exe` o API de Windows.
   - Nombre de servicio: `IndraStorageSync`.
   - Tipo: SERVICE_WIN32_OWN_PROCESS.
   - Inicio automatico (SERVICE_AUTO_START).

3. Registro de COM DLL.
   - Registro de componentes COM si es necesario para CFAPI futuro.
   - Rutas de registro estandar bajo HKEY_LOCAL_MACHINE.
   - Rollback si el registro falla.

4. Entradas de registro.
   - HKCU\Software\Indra\IndraStorageSync.
   - Valores: version, estado, ruta local.
   - Permitir desinstalacion limpia.

5. Crear ~/Indra\ Drive folder.
   - Ruta: %USERPROFILE%\Indra Drive.
   - Crear subcarpetas: .metadata, .cache, .inbox.
   - Permisos: usuario es propietario.

6. Launch UI post-install.
   - Ejecutar la UI web o Tauri shell.
   - Pasar parametro de inicio para indicar post-install.
   - Redireccionar a pantalla de configuracion si es primera vez.

7. Auto-start del servicio.
   - El servicio se inicia automaticamente con el sistema.
   - UI permite controlar start/stop de forma manual.

### Fase 3 - Linux (snap, deb, AppImage)

1. Descarga del binario.
   - Mismos mecanismos de descarga y validacion que Windows.
   - Soportar tanto x86_64 como aarch64.

2. Instalacion en ~/.local/bin/.
   - Hacer el binario executable (chmod +x).
   - Crear link simbolico si es necesario.
   - Permitir ejecucion sin permisos de root.

3. Systemd service.
   - Crear archivo de unit en ~/.config/systemd/user/indra-storage-sync.service.
   - Tipo: Type=simple.
   - ExecStart: ruta del binario con argumentos.
   - Restart: on-failure.
   - Auto-start: enable en usuario.

4. D-Bus service registration.
   - Registrar servicio D-Bus para IPC.
   - Permitir comunicacion con UI de forma segura.
   - Archivo .service en ~/.local/share/dbus-1/services/.

5. Crear ~/Indra\ Drive folder.
   - Ruta: $HOME/Indra\ Drive.
   - Subcarpetas: .metadata, .cache, .inbox.
   - Permisos: 0755 para usuario.

6. Auto-start del servicio.
   - `systemctl --user enable indra-storage-sync`.
   - `systemctl --user start indra-storage-sync`.
   - Validar estado post-instalacion.

### Fase 4 - Operaciones

1. Gestion de ventanas Tauri.
   - Crear ventana principal.
   - Mantenerla en topmost durante instalacion.
   - Cerrar limpiamente en exito o error.

2. Spawn asincrono del daemon.
   - Usar `Command` de Rust de forma asincrona.
   - Capturar stdout/stderr para log.
   - No bloquear la UI durante el spawn.

3. Seguimiento de progreso de instalacion.
   - Emitir eventos desde backend hacia frontend.
   - Barra de progreso actualizada en tiempo real.
   - Log detallado de cada paso.

4. Manejo de errores y rollback.
   - Si descarga falla: reintentar x3 con delay exponencial.
   - Si instalacion del servicio falla: desinstalar componentes previos.
   - Si creacion de carpeta falla: rollback de cambios anteriores.
   - Pantalla de error con opcion de reintentar o abortar.

5. Desinstalacion.
   - Parametro CLI: `--uninstall`.
   - Detener el servicio.
   - Eliminar servicio del sistema operativo.
   - Eliminar entradas de registro (Windows).
   - Eliminar binario.
   - NO eliminar la carpeta ~/Indra\ Drive (datos del usuario).

### Fase 5 - Tests

1. Instalacion en CI (GitHub Actions).
   - Windows: ejecutar setup.exe en VM de Windows.
   - Linux: ejecutar instalador en contenedor Ubuntu.
   - Validar que el servicio queda activo.

2. Verificacion post-instalacion.
   - Windows: ejecutar `sc query IndraStorageSync`.
   - Linux: ejecutar `systemctl --user status indra-storage-sync`.
   - Validar que la carpeta existe y tiene permisos correctos.

3. Desinstalacion en CI.
   - Ejecutar con parametro `--uninstall`.
   - Validar que el servicio se elimina.
   - Validar que la carpeta de datos no se elimina.

4. Tests unitarios.
   - Funciones de validacion de ruta.
   - Funciones de checksums.
   - Parseo de respuestas de descarga.

### Fase 6 - Verificacion

1. Windows.
   - Abrir Services y validar que `IndraStorageSync` aparece y esta activo.
   - Validar que la carpeta `%USERPROFILE%\Indra Drive` existe con subcarpetas.
   - Validar que UI abre post-instalacion.
   - Desinstalar y verificar que servicio se elimina.

2. Linux.
   - Ejecutar `systemctl --user status indra-storage-sync` y confirmar que esta activo.
   - Validar que `$HOME/Indra Drive` existe con subcarpetas.
   - Validar que el binario esta en `~/.local/bin/`.
   - Desinstalar y verificar que servicio se elimina.

3. Cross-platform.
   - Validar signatures de binarios si es aplicable.
   - Validar que desinstaladores no dejan residuos.
   - Validar que la carpeta de datos persiste post-desinstalacion.

## Entregables

1. **Windows**.
   - `setup.exe`: instalador MSI empaquetado por Tauri.
   - Binario daemon: descargado en tiempo de instalacion.
   - Registro de Windows: verificable post-instalacion.

2. **Linux**.
   - `.deb`: paquete Debian para instalacion via `apt`.
   - `.snap`: snap para instalacion universal en Linux.
   - `.AppImage`: AppImage portable (no requiere instalacion).
   - Binario daemon: descargado o empaquetado segun tipo.

3. **macOS** (stretch goal).
   - `.dmg`: disk image con aplicacion Tauri.
   - Notarization de Apple si es requerido.

4. **Documentacion**.
   - Guia de instalacion por plataforma.
   - Troubleshooting: servicios, permisos, rollback.
   - Changelog: versiones, cambios, seguridad.

## Prohibiciones

- No bundlear el daemon en el instalador; siempre descargar en runtime.
- No ejecutar instalacion de servicio sin consentimiento del usuario.
- No eliminar la carpeta de datos del usuario (~/Indra\ Drive) en desinstalacion.
- No crear entradas de registro innecesarias.
- No usar `sudo` en Linux sin pedirlo explicitamente.
- No stagear `.claude/settings.local.json`.

## Verificacion

```powershell
npx tsc --noEmit
npm run lint
npm run test:contract
cargo build --release
# En CI: ejecutar instaladores y validar estado post-instalacion
```

## Commit

Archivos exactos del commit:

- `docs/plans/04_PLAN_tauri-installer.md`
- `scripts/tauri-installer/` (si existe codigo base)

```text
docs(plan): add Tauri installer + distribution plan
```
