# 🗺️ Indra NEXT Sovereign — Roadmap Maestro

## 🏛️ Estado de la Infraestructura
**Versión Actual:** 1.2.0-sovereign
**Arquitectura:** Agnosticismo Radical / Stream-Through

---

## 🟢 1. Gestión de Ingesta (Producción Ready)
- [x] **Sovereign Media Engine (SME):** Pipeline de chunks con verificación SHA-256.
- [x] **Resumable Upload Proxy:** Integración nativa con Google Drive (Sin límites de /tmp).
- [x] **Ingestion Port Widget (IPW):** Interfaz "Reactor" con persistencia en IndexedDB.
- [x] **Port Designer (Admin):** UI para crear puertos con esquemas dinámicos y rutas axiomáticas.
- [x] **Rate Limiting & Security:** Protección de endpoints públicos y sanitización de paths.

## 🟡 2. Inteligencia de Medios (En Desarrollo)
- [ ] **Hardware-Accelerated Transcoder:** Worker basado en ffmpeg.wasm optimizado para multi-threading.
- [ ] **Universal Media Metadata:** Extracción profunda de EXIF, GPS y bitrates desde el cliente.
- [ ] **Smart Match Resume:** Reanudación de subidas interrumpidas cruzando identidad binaria.
- [ ] **Notion Sync Adapter:** Mapeo automático de archivos a bases de datos de inventario.

## 🔴 3. Automatización y Distribución (Hitos Futuros)
- [ ] **Peristaltic Sync (Inngest):** Triggers automáticos basados en eventos de ingesta.
- [ ] **Public Review Ports:** URLs temporales para que clientes comenten sobre el material bruto.
- [ ] **Multi-Cloud Vault:** Espejado automático entre Google Drive, S3 y servidores locales.

---

## 🛠️ Guía de Validación (Cómo Probar lo Actual)
1. **Crear Puerto:** Ve a `/dashboard/ports` y diseña un puerto apuntando a una carpeta de tu Drive.
2. **Subir Data:** Entra en la URL `/p/[slug]` y arrastra archivos pesados (>1GB).
3. **Smart Match:** Refresca la página en medio de una subida. Verás cómo Indra reanuda desde el último chunk exacto.
4. **Verificar Drive:** Los archivos aparecerán organizados según el patrón `{cliente}/{fecha}/...` sin haber pasado por el disco del servidor.
