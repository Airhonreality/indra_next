# 🛰️ INDRA NEXT: TELEOLOGÍA Y USABILIDAD
*La Guía de Propósito del Hub de Capacidades Soberanas*

## 1. VISIÓN TELEOLÓGICA (El "Por Qué")
Indra NEXT no es una aplicación de destino; es un **Hub de Capacidades**. 
Su existencia tiene un solo fin: **Eliminar la fricción entre la materia (datos) y la intención (acciones).**

- **Indra no es Notion:** No navegamos carpetas, ejecutamos intenciones.
- **Indra es una API Soberana:** Vive en el centro de tus herramientas actuales.
- **Indra es Agnóstica:** No le importa de dónde viene el dato, solo cómo transformarlo.

## 2. USABILIDAD: INDRA DESDE EL MUNDO EXTERIOR

### 2.1 Invocación desde ERPs/Webs Externas
Indra NEXT se consume como un servicio. Cualquier sistema en JS puede llamar a una "Super-Capacidad" de Indra:
```javascript
// Ejemplo: Sincronizar un pago con Notion y Drive
fetch('https://indra-api.vercel.app/api/actions/execute', {
  method: 'POST',
  body: { action: 'sync-payment', payload: { ... } }
});
```

### 2.2 El "Fractal Tree View" (Selector Universal)
Olvida los pickers de archivos tradicionales. El Fractal Tree es un widget de Indra que muestra una jerarquía unificada de **todos tus silos** (Google Drive, Notion DBs, Repos de GitHub) en una sola vista coherente. Tú eliges la materia, Indra la proyecta.

## 3. FILOSOFÍA DE WIDGETS (La Membrana)
Los widgets de Indra son **Proyectores de Acciones**. 

### 3.1 Auto-Proyección basada en Esquemas
Un widget no se programa para una tarea fija. El widget:
1. Pregunta a la API: *"¿Qué necesitas para esta acción?"*.
2. Recibe un **Config Schema** (ej: necesitas un API Key, una carpeta de destino y un formato).
3. El widget **se auto-monta visualmente** para pedir esos datos al usuario.

### 3.2 Desacoplamiento de Élite
Los widgets pueden vivir dentro del Dashboard de Indra o ser embebidos en cualquier otra aplicación, manteniendo su conexión directa con el "Cerebro" de Indra en Vercel.
