Viewed TELEOLOGY_AND_USABILITY.md:1-38

Aquí tienes la **Hoja de Ruta Maestra** de Indra NEXT, compilada a partir de tu visión teleológica y los contratos técnicos de la `MASTER_SPEC`. 

Esta no es una lista de tareas de un programador; es el **Mapa de Construcción del Hub de Capacidades**.

---

### 🗺️ ROADMAP MAESTRO: INDRA NEXT SOVEREIGN

#### FASE 1: La Médula y los Músculos (Conectividad Industrial)
*Objetivo: Que Indra pueda "tocar" la materia en cualquier silo sin burocracia.*
1.  **Infraestructura Nango:** Configurar el Host de Nango para manejar OAuth y Proxy de Notion/Sheets.
2.  **Portabilidad de Inteligencia:** Migrar las funciones de "Aplanado" (`_flattenProperties`) y "Resolución de Relaciones" de tu `.gs` original a los nuevos Adapters en TS.
3.  **Universal Record Store:** Implementar **Drizzle** para que cada dato que toque Indra sea normalizado y cacheado instantáneamente.

#### FASE 2: El Motor Peristáltico (Orquestación Resiliente)
*Objetivo: Que ninguna acción muera. Indra debe ser imparable.*
1.  **Configuración de Inngest:** Sustituir los "Pulsos" manuales de GAS por Workflows durables.
2.  **Motor de Acciones (The Brain):** Crear el orquestador que reciba una intención (ej: `migrate-notion-to-sheets`) y gestione los pasos, reintentos y transformaciones.
3.  **Manejo de Throttling:** Asegurar que Indra respete los límites de las APIs externas de forma nativa.

#### FASE 3: La Membrana (Interfaz de Proyección)
*Objetivo: Que la UI sea un espejo de la capacidad, no un formulario estático.*
1.  **Fractal Tree View:** Crear el selector universal de archivos y bases de datos que unifica Notion, Drive y Local.
2.  **Auto-Proyector de Widgets:** Desarrollar el sistema que lee el `Schema` de una acción y genera automáticamente los inputs en la UI usando **shadcn/ui**.
3.  **Sistemas Satélite:** Crear el script de "Invocación Externa" para que puedas llamar a las capacidades de Indra desde cualquier otra web.

#### FASE 4: El Espíritu (Inteligencia Agnóstica)
*Objetivo: Convertir la intención en código ejecutable.*
1.  **Vercel AI SDK Integration:** Conectar Claude/Gemini para que puedan "razonar" sobre los Records universales.
2.  **Natural Language Actions:** Poder decirle a Indra: *"Limpia los nombres de esta DB de Notion y pásalos a minúsculas"* y que Indra lo ejecute orquestando los adapters.

---

### 🛠️ ¿Cuál es el primer "Ladrillo"?
Para que esto sea "ultra rápido y directo" como pides, propongo empezar por el **Corazón de la Acción**:

1.  **Implementar el `src/lib/nango.ts`**: Para tener conexión real con Notion.
2.  **Crear el primer "Engine" (`src/core/engines/notion-exporter.ts`)**: Que porte tu lógica de `provider_notion.gs` y nos entregue un JSON perfecto.

**¿Empezamos con el código del cliente de Nango y el primer Engine?** Si me das el OK, procedo a configurar la conexión.