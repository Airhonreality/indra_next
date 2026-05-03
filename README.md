# Indra NEXT Sovereign

## 🛰️ El Hub de Inteligencia Agnóstica

Indra NEXT es la evolución de Indra OS. Hemos abandonado el modelo de "Sistema Operativo" monolítico en favor de una **Infraestructura de Capacidades** modular y ultrarrápida construida sobre Next.js y Vercel.

### 🏗️ Arquitectura
El proyecto sigue un patrón **Hexagonal (Ports & Adapters)**:
- **Core**: Lógica de negocio pura (Acciones y Tipos).
- **Integrations**: Adapters para hablar con Notion, Google Sheets, WhatsApp, etc.
- **Components**: Widgets interactivos que proyectan la materia.

### 📜 Documentación
Toda la verdad técnica del sistema reside en:
`docs/MASTER_SPEC.md`

### 🚀 Desarrollo
Para iniciar el servidor de desarrollo:
```bash
npm run dev
```

---
"La arquitectura es el lenguaje de la soberanía."
