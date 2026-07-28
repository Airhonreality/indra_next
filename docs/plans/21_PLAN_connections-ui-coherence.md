---
plan: 21_PLAN_connections-ui-coherence
estado: EJECUTADO
ejecutor: codex
depende_de: [11, 12, 12B, 18, 19]
---

# 21 - Coherencia total de la UI de conexiones y explorador

## Contexto

La UI actual ya demuestra algo importante: Indra sí puede guardar conexiones de
Google, MEGA, Cloudflare R2 y Claro Drive, y también puede mostrar un explorador
de silos. Pero la experiencia sigue siendo contradictoria por tres razones:

1. **El modelo mental de la interfaz no coincide con el modelo real de datos**.
   - La pantalla mezcla "familias de proveedor", "cuentas", "vault de credenciales"
     y "conexión activa" como si fueran lo mismo.
   - El botón principal cambia de sentido entre `Conectar`, `Abrir vault`, `Desconectar`
     y `Hide`, lo que rompe la comprensión.

2. **Las cuentas multi-servicio no se expresan de forma consistente**.
   - Google aparece como una sesión única que activa Drive, Sheets y YouTube, pero la
     UI no deja claro cómo añadir otra cuenta sin pisar la anterior.
   - MEGA, Claro Drive y Cloudflare R2 viven en un vault de credenciales, pero el
     panel principal no muestra todas las opciones de forma uniforme.

3. **El explorador se alimenta de un estado agregado que no siempre explica el vacío**.
   - Si un silo no tiene inventario, el panel puede verse como "vacío" sin decir si el
     problema es credencial, ruta, permisos o ausencia real de archivos.
   - Una conexión marcada como activa no significa necesariamente que el backend ya
     haya probado la cuenta o que tenga contenido navegable.

## Diagnóstico

Incoherencias concretas que este plan debe resolver:

1. **Conectar no es igual a gestionar**.
   - La pantalla de conexiones debe separar claramente:
     - catálogo de servicios disponibles;
     - lista de cuentas ya conectadas;
     - acción para añadir otra cuenta;
     - acción para desconectar una cuenta concreta.

2. **La unidad de UI correcta es la cuenta, no la familia**.
   - Google, MEGA, Claro y R2 no deben representarse como un único estado booleano.
   - Cada credencial guardada debe tener su propia fila, su propio identificador y su
     propio estado.

3. **El vault no debe ser un contenedor escondido dentro de una tarjeta**.
   - El vault debe abrirse como superficie explícita de gestión.
   - La tarjeta de proveedor solo debe servir como puerta de entrada al vault, no como
     contenedor final de toda la interacción.

4. **Google necesita soporte de múltiples cuentas sin colapsar el estado**.
   - La lógica actual que decide conectar o desconectar por `type` no es suficiente.
   - Debe quedar posible añadir más de una conexión del mismo proveedor sin que la
     primera bloquee el resto.

5. **Claro no puede quedar como "conectado" sin una prueba real**.
   - Si falla la validación de credenciales, la conexión no debe persistirse como activa.
   - La UI debe mostrar el error real del login.

6. **El explorador debe explicar el vacío**.
   - Si un proveedor no tiene inventario, la interfaz debe indicar si es un fallo de
     acceso, una cuenta vacía o una ruta sin contenido.
   - No debe quedar un árbol vacío sin contexto.

## Diseño objetivo

La UI debe reorganizarse en una sola estructura coherente:

1. **Cabecera de estado global**
   - Muestra cuántas cuentas hay por proveedor.
   - Muestra si el proveedor está validado, vacío o con error.
   - Da acceso a acciones globales: refrescar, añadir cuenta y ver diagnóstico.

2. **Catálogo de servicios**
   - Las seis familias visibles deben estar siempre presentes:
     - Google
     - Microsoft
     - Notion
     - Cloudflare R2
     - Claro Drive
     - MEGA
   - Cada familia puede tener una o más cuentas debajo.
   - La tarjeta no cambia de sentido cuando ya existe una cuenta; siempre ofrece
     "Añadir cuenta" y deja la desconexión para cada fila de cuenta.

3. **Gestor de cuentas**
   - Cada cuenta debe mostrar:
     - etiqueta humana;
     - proveedor;
     - estado de validación;
     - origen o servidor;
     - acción para abrir su inventario;
     - acción para desconectarla.
   - El estado se calcula por cuenta, no por familia.

4. **Vault unificado**
   - Un solo panel para crear o editar credenciales.
   - El vault debe abrirse ya enfocado en el proveedor correcto.
   - Sus pestañas solo sirven para cambiar de servicio dentro del mismo flujo.

5. **Explorador con estado explicable**
   - Cada proveedor activo debe poder abrir su inventario.
   - Si el inventario está vacío, la UI debe decir por qué.
   - Si el provider está activo pero el árbol no carga, la UI debe diferenciar:
     - problema de login;
     - problema de permisos;
     - proveedor vacío;
     - error de adaptación.

## Operaciones

### Paso 1 - Unificar el modelo de conexiones

1. Reescribir la pantalla de conexiones para que use una estructura de:
   - catálogo de familias;
   - lista de cuentas por familia;
   - acciones por cuenta;
   - acciones globales por familia.

2. Eliminar la lógica booleana de "conectado / desconectado" como estado principal de
   la tarjeta.
   - Una familia puede tener 0, 1 o N cuentas.
   - La tarjeta debe mostrar conteos, no ocultar el resto de cuentas.

3. Asegurar que Google, MEGA, R2, Claro y OneDrive se vean como familias de primer
   nivel, no como acciones escondidas o modos especiales.

### Paso 2 - Corregir la gestión multi-cuenta

1. Hacer que conectar una nueva cuenta no reemplace la anterior.
   - Cada alta debe crear o actualizar una conexión concreta.
   - El criterio de identidad debe ser `connectionId` + `provider`, no solo `type`.

2. Cambiar las acciones de desconexión para que operen sobre una cuenta concreta.
   - Nunca desconectar "Google" como familia si lo que existe son varias cuentas.
   - Nunca usar una búsqueda por `type` que solo encuentre la primera coincidencia.

3. Mostrar una lista visible de cuentas conectadas por familia.
   - Cada fila debe permitir abrir el vault o el explorador de esa cuenta.

### Paso 3 - Unificar el vault

1. Transformar el vault en una única superficie modal o panel lateral.
   - El usuario debe entrar allí desde la familia de proveedor, no desde un contenedor
     escondido dentro de otra tarjeta.

2. Mantener las pestañas por proveedor, pero con una jerarquía clara:
   - familia;
   - cuenta;
   - credenciales;
   - validación;
   - guardado.

3. Asegurar que Claro, R2 y MEGA queden visibles con el mismo nivel de acceso.
   - El vault no debe privilegiar un proveedor por cómo quedó maquetado.

### Paso 4 - Diagnóstico real de login y estado

1. La UI debe reflejar el resultado real de la validación de credenciales.
   - Si la validación falla, la cuenta no se presenta como conectada.
   - Si el proveedor está vacío, debe decirlo.

2. Añadir mensajes de estado legibles por cuenta.
   - válido;
   - inválido;
   - vacío;
   - sin inventario;
   - error de permisos;
   - error de red.

3. Conectar el estado visual con el resultado del backend sin suposiciones.
   - No marcar "conectado" solo por haber guardado credenciales.

### Paso 5 - Hacer coherente el explorador

1. El explorador debe recibir una lista de conexiones que ya venga tipada por familia,
   cuenta y estado.

2. Si un proveedor no tiene objetos, el árbol debe enseñar una explicación concreta.
   - No basta con mostrar un nodo vacío.

3. El panel debe permitir escoger proveedor, cuenta e inventario sin confundir la
   selección de proveedor con la de cuenta.

### Paso 6 - Normalizar copy y jerarquía visual

1. Cambiar el texto de la UI para usar términos estables:
   - familia;
   - cuenta;
   - proveedor;
   - conexión;
   - inventario;
   - validación.

2. Eliminar copy contradictorio como:
   - "Conectar" cuando en realidad abre un vault;
   - "Conectado" cuando solo existe una credencial guardada;
   - "Hide" en un flujo de trabajo principal.

3. Reducir el scroll y dejar visible el estado de la cuenta en el primer pantallazo.

### Paso 7 - Cerrar la coherencia end-to-end

1. Google debe permitir múltiples cuentas visibles.
2. Claro debe pasar validación real antes de mostrarse activa.
3. R2 debe quedar como cuenta gestionable, no como referencia escondida.
4. El explorador debe mostrar qué cuenta alimenta qué inventario.
5. El usuario debe entender, sin abrir código, qué está conectado y qué no.

## Prohibiciones

- No volver a esconder proveedores dentro de una tarjeta de otro servicio.
- No usar `type` como identidad única de una cuenta.
- No marcar una conexión como válida si no se probó su login.
- No dejar el explorador sin un mensaje de causa cuando el árbol esté vacío.
- No fragmentar esta corrección en microparches sueltos que cambien el modelo otra vez.
- No stagear `.claude/settings.local.json`.
- No usar `git add -A` ni `git add .`.

## Verificación

```powershell
npx tsc --noEmit
npm run lint -- src/features/connections src/components/storage src/app/api/integrations src/app/api/storage
npm run build
git diff --cached --stat
```

## Commit

Archivos exactos del commit:

- `docs/plans/21_PLAN_connections-ui-coherence.md`

```text
docs(plan): unify connections UI model and storage explorer coherence (Plan 21)
```
