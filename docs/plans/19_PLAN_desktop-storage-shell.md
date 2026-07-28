---
plan: 19_PLAN_desktop-storage-shell
estado: LISTO
ejecutor: codex
depende_de: [11, 12, 12B, 18]
---

# 19 - Desktop instalable para storage soberano

## Contexto

Hoy Indra NEXT ya tiene:

- un backend y UI web en Next.js;
- el adaptador `s3` para Cloudflare R2 / S3 bajo el provider id `s3`;
- el proveedor `claro` para almacenamiento tipo Nextcloud/WebDAV;
- un explorador de storage que vive en la web;
- y una base conceptual para carpeta local, trazabilidad de origen y UX de archivos.

Lo que **todavia no existe** es la pieza que convierte eso en una app instalable de escritorio
tipo Google Drive Desktop:

1. una shell nativa que se instale en Windows y arranque Indra como producto local;
2. un panel de cuentas para registrar varias identidades de storage sin mezclar origen ni ruta;
3. un motor local que permita ver el storage como una unidad o carpeta de trabajo, con
   trazabilidad completa de proveedor, cuenta, conexion y ruta;
4. una experiencia de exploracion de archivos pensada para escritorio, no solo para web.

Este plan separa claramente dos cosas:

- **Desktop shell**: el contenedor instalable, tray, autostart, ventana principal y actualizaciones.
- **Local drive bridge**: el puente real con filesystem local / virtual mount para acceder a los archivos.

La referencia tecnica para la capa local es `docs/research/Local drive integration.md.txt`.
La referencia de producto para storage unificado y Claro es `docs/plans/18_PLAN_storage-local-claro-ui.md`.

## Operaciones

### Fase 1 - Shell de escritorio instalable

1. Crear una superficie desktop que reuse la UI existente de Indra sin duplicar negocio.
   - Definir un subproyecto desktop en el repo para empaquetado instalable.
   - Reusar la UI actual como contenido principal de la ventana.
   - Mantener el shell separado del core de storage para no mezclar presentacion con dominio.

2. Añadir ciclo de vida de escritorio.
   - Ventana principal.
   - Icono de bandeja / tray.
   - Arranque con el sistema.
   - Persistencia de preferencias locales.
   - Cierre seguro sin perder estado de sincronizacion.

3. Mantener la instalacion centrada en Windows primero.
   - Windows es la prioridad para una experiencia tipo Google Drive Desktop.
   - Linux queda como segunda fase de paridad para el bridge local.

### Fase 2 - Panel de cuentas multi-storage

1. Crear un panel de cuentas que soporte multiples conexiones por proveedor.
   - Cloudflare / R2: hasta 10 cuentas visibles y trazables.
   - Claro Drive: una o mas cuentas segun lo que soporte la verificacion real.
   - Cada cuenta debe guardar provider, nombre visible, estado y ruta/identificador.

2. Separar autenticacion de almacenamiento y no mezclar credenciales entre cuentas.
   - Credenciales cifradas localmente.
   - Estado de login por cuenta.
   - Boton de reautenticacion / desconexion por identidad.
   - Prueba de conexion antes de darla por activa.

3. Reusar los providers existentes en vez de crear nuevas variantes conceptuales.
   - `s3` sigue siendo el provider id para Cloudflare R2 / S3.
   - `claro` sigue siendo el provider para Claro Drive.
   - No introducir un nuevo nombre de proveedor que rompa el contrato actual.

### Fase 3 - Bridge local de archivos

1. Convertir la carpeta local en un origen de trabajo visible y trazable.
   - Un root local de trabajo por usuario o perfil.
   - Metadata que preserve origen: provider, conexion, cuenta y ruta remota.
   - El panel debe poder mostrar si un archivo vive en local, en cloud o en ambos.

2. Diseñar el bridge con dos niveles.
   - Nivel de trabajo local: carpeta sincronizada y gestionada por Indra.
   - Nivel de integracion nativa: mount virtual / sync root para Windows y FUSE para Linux.

3. Ajustar la experiencia para operaciones frecuentes de escritorio.
   - abrir archivo;
   - copiar / mover entre cuentas;
   - renombrar;
   - arrastrar y soltar entre storages;
   - ver progreso y errores por cuenta;
   - conservar procedencia despues de cada operacion.

### Fase 4 - UX del explorador de escritorio

1. Rehacer la navegacion para densidad de trabajo real.
   - Breadcrumbs.
   - Buscador.
   - Filtros por proveedor, cuenta, tipo y estado.
   - Seleccion multiple.
   - Barra de acciones persistente.

2. Hacer visible la trazabilidad todo el tiempo.
   - Proveedor.
   - Cuenta.
   - Conexion.
   - Ruta original.
   - Estado de sincronizacion.

3. Mejorar jerarquia visual para pantalla grande.
   - Panel lateral util.
   - Lista / grid con mas ancho efectivo.
   - Vista de detalle y preview sin esconder contexto.
   - Estados vacios y de carga que expliquen que esta pasando.

### Fase 5 - Instalacion y distribucion

1. Definir artefactos instalables.
   - Instalador para Windows.
   - Auto-update.
   - Arranque al iniciar sesion del usuario.
   - Acceso rapido desde bandeja.

2. Mantener la distribucion coherente con el repo actual.
   - No duplicar providers.
   - No romper la app web.
   - No exigir al usuario una migracion manual rara entre web y desktop.

3. Dejar listo el camino para paridad futura.
   - Linux desktop.
   - Mejoras de shell integration.
   - Refuerzo de thumbnails / preview nativo cuando aplique.

### Fase 6 - Honestidad tecnica y verificaciones

1. Claro Drive solo entra como compatibilidad real si la evidencia lo sostiene.
   - Si la via real de login/listado no se puede verificar, el plan debe detenerse y reportarlo.
   - No inventar soporte por deseo de producto.

2. No tocar otros adaptadores fuera de lo imprescindible para el desktop shell.
   - El foco es el contenedor instalable, el bridge local y la UX.
   - No abrir frentes nuevos de storage salvo wiring minimo necesario.

3. Cerrar el plan solo cuando la experiencia sea usable de extremo a extremo.
   - Instalable.
   - Login multi-cuenta.
   - Vista unificada de archivos.
   - Trazabilidad completa.
   - Operaciones basicas de gestion de archivos.

## Prohibiciones

- No inventar una app desktop sin shell instalable real.
- No mezclar la UI web con el bridge local como si fueran lo mismo.
- No declarar soporte de Claro Drive sin verificacion real del flujo de acceso.
- No crear nombres de proveedor nuevos si ya existe `s3` para Cloudflare / R2.
- No tocar rutas API ni adaptadores ajenos salvo el wiring minimo estrictamente necesario.
- No stagear `.claude/settings.local.json`.
- No usar `git add -A` ni `git add .`.

## Verificacion

```powershell
npx tsc --noEmit
npm run lint
npm run test:contract
npm run build
git diff --cached --stat
```

## Commit

Archivos exactos del commit:

- `docs/plans/19_PLAN_desktop-storage-shell.md`

```text
docs(plan): desktop installable shell for unified storage management (Plan 19)
```
