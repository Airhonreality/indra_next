---
plan: 19_PLAN_desktop-storage-shell
estado: LISTO
ejecutor: codex
depende_de: [11, 12, 12B, 18]
---

# 19 - Cliente desktop para storage soberano

## Contexto

El repo ya tiene una base funcional de web app y backend:

- autenticacion y panel de conexiones;
- providers `s3` para Cloudflare R2 / S3, `claro` para WebDAV / Claro Drive y otros adaptadores;
- explorador de storage con trazabilidad por conexion;
- soporte de carpeta local como origen de trabajo para el provider `storage`.

Lo que **todavia no existe** es el producto correcto para escritorio: un cliente tipo Google Drive Desktop que
crea y administra una carpeta local en el sistema, mantiene el origen de cada archivo y sincroniza cambios
sin depender de una interfaz web presentada como objetivo principal.

Este plan separa dos planos:

- **Control plane**: login, cuentas, administracion y estado operativo.
- **Data plane**: carpeta local gestionada, sincronizacion nativa y acceso desde el explorador del sistema.

La referencia tecnica para el puente local es `docs/research/Local drive integration.md.txt`.

## Objetivo real

Construir una experiencia desktop que permita:

1. autenticar cuentas de storage;
2. crear o validar una raiz local de trabajo por usuario;
3. navegar archivos con trazabilidad de proveedor, cuenta y ruta;
4. preparar el camino para integracion nativa de filesystem en Windows y Linux;
5. mantener el repositorio honesto sobre que esta implementado y que sigue siendo futuro.

## Secuencia del trabajo

La siguiente lane se ordena asi:

1. Dejar una shell minima de administracion y estado.
2. Crear y exponer una raiz local gestionada por usuario.
3. Encajar esa raiz con el explorador de storage y la trazabilidad.
4. Preparar el puente nativo futuro para sincronizacion real con el sistema operativo.

## Operaciones

### Fase 1 - Contrato local de escritorio

1. Definir la raiz local gestionada.
   - Una carpeta por usuario o perfil.
   - Metadata local para registrar el origen y el estado.
   - Subcarpetas de soporte para entrada, cache y miniaturas.

2. Exponer esa raiz al shell.
   - Consultar estado.
   - Crear la raiz si no existe.
   - Mostrar ruta y readiness.

3. Mantener la administracion separada del data plane.
   - Login y cuentas viven en la shell.
   - El filesystem local vive en el contrato de storage.

### Fase 2 - Shell desktop minimo

1. Convertir la vista desktop en un panel de estado real.
   - Raiz local.
   - Cuentas activas.
   - Proveedor activo.
   - Estado de sincronizacion.

2. Evitar el lenguaje de PWA como objetivo principal.
   - No vender el producto como una simple app instalable web.
   - La meta es una experiencia de storage de escritorio.

3. Reusar la UI actual solo como superficie de control.
   - Login.
   - Administracion basica.
   - Acciones de mantenimiento.

### Fase 3 - Explorador con trazabilidad

1. Hacer visible el origen en cada elemento.
   - Proveedor.
   - Cuenta.
   - Conexion.
   - Ruta remota o local.

2. Mantener densidad de trabajo real.
   - Breadcrumbs.
   - Busqueda.
   - Filtros.
   - Seleccion multiple.

3. Preparar thumbnails y preview sin hidratar de mas.
   - Cache local.
   - Rango de bytes para metadatos.
   - Evitar bloqueos del explorador.

### Fase 4 - Bridge nativo futuro

1. Windows primero.
   - CFAPI / sync root como camino nativo.
   - Integracion con File Explorer.
   - Registro del proveedor de storage cuando exista el binario nativo.

2. Linux como segunda fase.
   - FUSE / FUSE3.
   - Mount local y lectura diferida.

3. No prometer el bridge nativo antes de tenerlo.
   - El repo puede dejar contratos, helpers y UI.
   - El binario y la extension nativa siguen siendo trabajo futuro.

### Fase 5 - Instalacion y distribucion

1. Definir artefactos reales.
   - Shell desktop empaquetado.
   - Servicio local de sincronizacion.
   - Actualizacion y arranque automatico cuando exista el binario nativo.

2. No duplicar negocio.
   - No crear providers nuevos si ya existe `s3`.
   - No mezclar web admin con motor de filesystem.

3. Cerrar el plan solo cuando la experiencia sea util de extremo a extremo.
   - Login funcional.
   - Raiz local gestionada.
   - Exploracion trazable.
   - Camino nativo preparado.

### Fase 6 - Honestidad tecnica y verificacion

1. Si el bridge nativo no esta implementado, decirlo de forma directa.
   - No inventar CFAPI ni FUSE.
   - No declarar sincronizacion de sistema operativo sin binario real.

2. Limitar el radio de cambio.
   - No tocar adaptadores ajenos salvo el wiring minimo necesario.
   - Mantener el foco en la experiencia desktop de storage.

3. Verificar la base de trabajo.
   - Typecheck.
   - Lint.
   - Build.
   - Contratos de integraciones.

## Prohibiciones

- No presentar la app web como si fuera el cliente desktop final.
- No prometer una extension nativa que no exista.
- No crear nombres nuevos de proveedor si ya existe `s3` para Cloudflare / R2.
- No tocar otros adaptadores fuera de lo imprescindible.
- No stagear `.claude/settings.local.json`.
- No usar `git add -A` ni `git add .`.

## Verificacion

```powershell
npx tsc --noEmit
npm run lint
npm run test:contract
npm run build
```

## Commit

Archivos exactos del commit:

- `docs/plans/19_PLAN_desktop-storage-shell.md`

```text
docs(plan): align desktop plan with managed local drive client
```
