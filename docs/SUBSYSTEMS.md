# Índice de Subsistemas — Indra Next Sovereign

> Mantenido por planes. Última actualización: 2026-07-04 por Plan 01.

| Subsistema | Ruta | Propósito | Estado | Docs |
|---|---|---|---|---|
| Storage API (Streaming) | `src/app/api/storage/stream` | Streaming endpoint para archivos desde proveedores agnósticos (union de storages). Soporta HTTP Range requests y transcoding dinámico. | EN_DESARROLLO | `docs/specs/STORAGE_MASTER_PLAN.md` |
| Storage API (Union) | `src/app/api/storage/union` | Endpoint de inventario unificado que agrega archivos de múltiples proveedores de storage (Drive, Mega, R2, OneDrive, etc.). | EN_DESARROLLO | `docs/specs/STORAGE_MASTER_PLAN.md` |
| Integrations API | `src/app/api/integrations` | CRUD agnóstico de conexiones OAuth (Nango) y metadatos de integraciones. Soporta múltiples proveedores con registro dinámico. | EN_DESARROLLO | — |
| Public Portals API | `src/app/api/p` | Endpoints públicos para portales de ingesta (upload, session, finalize). Soporta resumable uploads y archivos binarios chunked. | EN_DESARROLLO | `docs/specs/IPW_MASTER_PLAN.md` |
| Dashboard | `src/app/dashboard` | Panel administrativo privado (requiere auth). Navegación, explorador de archivos, panel de integraciones. | EN_DESARROLLO | — |
| Components: Storage | `src/components/storage` | Widget de explorador de archivos agnóstico (StorageWidgetClient, AgnosticTree, CredentialVault). Usa useInventory para hidratación. | EN_DESARROLLO | `docs/specs/STORAGE_MASTER_PLAN.md` |
| Components: Ingestion | `src/components/ingestion` | Widget soberano de ingesta (sovereign-ingestor.tsx). Cola simple sin chunking, para upload de archivos en portales públicos. | EN_DESARROLLO | `docs/specs/IPW_MASTER_PLAN.md` |
| Components: UI | `src/components/ui` | Primitivos shadcn-style (input, label, select, badge). Mínimos, accesibles, sin dependencias de terceros. | ESTABLE | — |
| Components: Other | `src/components/{data-portal-preview,layouts,ports,resource-explorer,routing,widgets}` | Componentes especializados: preview de portales, layouts, explorador de recursos, enrutamiento, widgets compuestos. | EN_DESARROLLO | — |
| Core: Database Schema | `src/core/db/schema.ts` | Esquema universal Drizzle ORM (integrations, storageConnections, files, collections, etc.). Define contrato de persistencia agnóstica. | ESTABLE | `docs/specs/STORAGE_MASTER_PLAN.md` |
| Core: Inventory Service | `src/core/inventory` | Servicio de descubrimiento agnóstico de archivos. Consulta API de cada proveedor, normaliza a formato unificado, cacheable. | EN_DESARROLLO | `docs/specs/STORAGE_MASTER_PLAN.md` |
| Core: Media & Transcoding | `src/core/media` | Motor de transcodificación de archivos (miniaturización, ultracompresión). TODO: auditar estado y dependencias. | ROTO | `docs/research/invs_Metadata_transcode.md`, `docs/research/Video/` |
| Core: Registry & Types | `src/core/types`, `src/core/registry.ts` | Registro dinámico de adaptadores, interfaces de contrato (StorageAdapter, IntegrationAdapter), tipos unificados. | ESTABLE | `docs/specs/MASTER_SPEC.md`, `docs/plans/11_PLAN_storage-adapter-contract.md` |
| Contract Testing | `src/core/testing` | Suite de contrato de adaptadores (Vitest): valida manifiesto de capacidades y coherencia manifiesto→implementación. | ESTABLE | `docs/plans/11_PLAN_storage-adapter-contract.md` |
| Core: Engines | `src/core/engines` | Motores de procesamiento agnóstico (pipeline, data flow). Soportan dry-run, transformaciones, observabilidad. | EN_DESARROLLO | — |
| Hooks | `src/hooks` | use-inventory (hidratador de archivos), use-ingestion-orchestrator (orquestador de subida), otros hooks de UI. | EN_DESARROLLO | — |
| Inngest Functions | `src/inngest/functions` | Funciones durables para workflows (run-agnostic-pipeline, etc.). Triggers Inngest v4, retry/observability nativa. | EN_DESARROLLO | — |
| Integrations: Google Drive | `src/integrations/google-drive` | Adaptador agnóstico para Google Drive (Nango OAuth, Resumable Upload, file listing, metadata). | EN_DESARROLLO | — |
| Integrations: Google Sheets | `src/integrations/google-sheets` | Adaptador para Google Sheets (Sheets REST API v4, Nango, source schema detection). | EN_DESARROLLO | — |
| Integrations: Notion | `src/integrations/notion` | Adaptador para Notion (flattenProperties, resolveRelationNames, porting desde provider_notion.gs). | EN_DESARROLLO | — |
| Integrations: Storage (FS) | `src/integrations/storage` | Adaptador para filesystem local (JSON + CSV). Upsert logic, configurable STORAGE_BASE_PATH. | EN_DESARROLLO | — |
| Integrations: Mega | `src/integrations/mega` | TODO: auditar estado. Mega.nz provider bajo desarrollo. | TODO: auditar | — |
| Integrations: OneDrive | `src/integrations/onedrive` | Adaptador OneDrive, registrado en `register-all.ts`. | TODO: auditar | — |
| Integrations: YouTube | `src/integrations/youtube` | Adaptador YouTube (publish-target), registrado en `register-all.ts`. | TODO: auditar | — |
| Integrations: Storage Union | `src/integrations/storage-union` | Meta-adaptador de unión de storages (registro vía `storage-union/register`). | TODO: auditar | — |
| Integrations: JSON File | `src/integrations/json-file` | Adaptador JSON local. NO está importado en `register-all.ts` (posible legado). | TODO: auditar | — |
| Integrations: R2/Cloudflare | (sin adaptador) | NO implementado. Solo existe captura de credenciales (CredentialVault + `api/integrations/route.ts`, trabajo en curso sin commitear). Corregido en auditoría: la ruta `src/integrations/r2` reportada por Plan 01 no existe. | PENDIENTE | — |
| Integrations: Registry Bootstrap | `src/integrations/register-all.ts` | Fuente de verdad de qué adaptadores quedan registrados en el UniversalRegistry. | ESTABLE | — |
| Lib: Authorized Client | `src/lib/authorized-client.ts` | Factory agnóstica de clientes HTTP autenticados (NangoAuthorizedClient, DirectFetchClient). Inyección de credenciales sin condicionales. | ESTABLE | `docs/specs/MASTER_SPEC.md` |
| Features | `src/features` | Módulos de capacidades compuestas (connections, etc.). Organizan lógica por dominio. | EN_DESARROLLO | — |
| Database Migrations | `drizzle/` | Historial de migraciones SQL (Drizzle). Versionado, auditables. | ESTABLE | — |
| Plans | `docs/plans/` | Planes ejecutables con frontmatter de estado (BORRADOR, LISTO, EN_EJECUCION, EJECUTADO, AUDITADO, RECHAZADO). | EN_DESARROLLO | — |
| Specifications | `docs/specs/` | Diseños maestros agnósticos: STORAGE_MASTER_PLAN, IPW_MASTER_PLAN, SME_MASTER_PLAN, TELEOLOGY_AND_USABILITY, MASTER_SPEC. | EN_DESARROLLO | — |
| Research & Reference | `docs/research/` | Papers científicos, investigación (INVS SDK embed, storage soberano, INS Arnes agentico), Maps de navegación conceptual. | EN_DESARROLLO | — |
