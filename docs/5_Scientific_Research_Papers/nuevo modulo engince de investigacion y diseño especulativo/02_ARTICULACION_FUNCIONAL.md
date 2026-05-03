# 02 | Articulación Funcional: Aspiraciones y Teleología

> **Pregunta guía:** ¿Para qué sirve esto en el mundo real y cómo cumple su propósito?

---

## I. El Telos: El Destino Final del Sistema

El Speculative Engine no es una herramienta de documentación. Es un **sistema de inteligencia procesual** que quiere cumplir un único propósito:

> **Hacer visible el pensamiento invisible de un proceso de diseño cocreativo.**

Esto implica que el sistema debe ser capaz de:
1. **Recopilar** el conocimiento distribuido en notas, trazos y convercaciones.
2. **Conectar** ideas que parecen no relacionadas entre sí.
3. **Comunicar** el proceso a audiencias transdisciplinares (no solo técnicos).
4. **Simular** rutas alternativas para el diseño especulativo.

---

## II. Mapa de Aspiraciones por Motor

### Workspace Kernel → Aspiración: Soberanía de Datos
- **Capacidad actual:** Indexar archivos `.mdx` locales en una API.
- **Capacidad media:** Sincronizar el cuaderno local con una fuente en la nube (Google Drive, INDRA).
- **Capacidad alta:** Múltiples cuadernos de investigación (proyectos) intercambiables en el mismo motor. Un investigador diferente conecta su cuaderno y el motor lo visualiza sin cambiar una línea de código.

### Graph Engine → Aspiración: Causalidad Visible
- **Capacidad actual:** Dibujar nodos y arcos basados en los metadatos de las notas.
- **Capacidad media:** Trazar el "camino del pensamiento" completo: cómo una sesión de brainstorming en el Canvas se convirtió en una nota, que luego influyó en una decisión de diseño.
- **Capacidad alta:** Mapas de causalidad con **pesos** (qué ideas tuvieron más impacto) y **tiempo** (cuándo fue el giro crucial del proceso).

### Canvas Engine → Aspiración: Legitimidad del Boceto
- **Capacidad actual:** Lienzo infinito para dibujo libre persistido localmente.
- **Capacidad media:** Los trazos son "reconocidos" por INDRA (cada marco del lienzo puede ser catalogado como un Artifact de INDRA con su ID único).
- **Capacidad alta:** Sesiones colaborativas sincronizadas en tiempo real (Yjs + WebRTC) donde múltiples investigadores dibujan en el mismo lienzo desde distintos computadores.

### Narrative Engine → Aspiración: Comunicación Transdisciplinar
- **Capacidad actual:** Renderizar notas `.mdx` con componentes interactivos embebidos.
- **Capacidad media:** "Publicar" una vista limpia del proceso para cliente o comunidad. Un URL único que muestra la historia del proceso de diseño de Montechico.
- **Capacidad alta:** Diferentes narrativas sobre los mismos datos. La misma investigación puede tener un "vista técnica" (para desarrolladores) y una "vista comunitaria" (para la comunidad del proyecto).

---

## III. Cumplimiento Teleológico: Los Hitos del Sistema

Para medir si el sistema está cumpliendo su telos, definimos hitos funcionales:

| Hito | Indicador de Cumplimiento |
|---|---|
| **H1: Soberanía Del Dato** | El cuaderno local de notas se puede leer en la web sin subir nada a un servidor externo. |
| **H2: Visibilidad del Proceso** | Dado un conjunto de notas de Montechico, el Graph Engine dibuja un mapa coherente de sus relaciones. |
| **H3: La Nota Viva** | Editar una nota en la web actualiza el archivo `.mdx` local en tiempo real. |
| **H4: La Historia Pública** | El proceso de diseño de Montechico puede ser visto en un URL público sin exponer el cuaderno privado. |
| **H5: Compatibilidad INDRA** | Un "Atom" de Montechico puede ser validado por el `SchemaRegistry` de INDRA OS sin errores. |

---

## IV. El Motor como "Portfolio Vivo" del Proceso

Más allá de la investigación, el sistema puede ser la carta de presentación de los proyectos de diseño especulativo:

- **Para comunidades:** Una web accesible que muestra el viaje de Montechico con mapas interactivos y bocetos.
- **Para fondos y convocatorias:** Un "repositorio de proceso" que demuestra rigurosidad metodológica con datos verificables.
- **Para replicación:** Cualquier otro proyecto de diseño especulativo puede usar el mismo motor; solo cambia el cuaderno de notas.
