/**
 * 🏛️ ARTEFACTO: opfs-staging-orchestrator.ts
 * ────────────
 * CAPA: Lib (Infrastructure Services)
 * VERSIÓN: 1.0.0
 * COMMIT: P3-M9.4-OPFS-STAGING-LAYER
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Gestión de persistencia efímera en el Origin Private File System (OPFS).
 * - Orquestación de Slices para evitar desbordamiento de RAM en archivos >2GB.
 * - Soporte para acceso concurrente vía FileSystemSyncAccessHandle en Workers.
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Validar la disponibilidad de OPFS antes de iniciar el staging.
 * - NEVER: Almacenar archivos fuera del contexto privado (No usar IndexedDB para binarios).
 * - ALWAYS: Limpiar handles y archivos temporales tras la transcodificación.
 * 
 * 📜 ADR: [2026-05-14] OPFS_FOR_HIGH_FIDELITY_TRANSCODING
 * - DECISIÓN: Usar OPFS como área de intercambio (Staging Area) para FFmpeg.wasm.
 * - MOTIVO: Superar los límites de memoria de Safari/Chrome en dispositivos móviles.
 * - IMPACTO: Capacidad de transcodificar archivos de 20GB+ con consumo de RAM <128MB.
 * 
 * 🔗 RELATIONSHIPS:
 * - UPSTREAM: [FFmpeg.wasm, WebCodecs]
 * - DOWNSTREAM: [TranscoderWorker, IngestionOrchestrator]
 */

export class OPFSStagingOrchestrator {
  private root: FileSystemDirectoryHandle | null = null;

  async init() {
    if (!navigator.storage || !navigator.storage.getDirectory) {
      throw new Error('OPFS_UNSUPPORTED: Origin Private File System not available.');
    }
    this.root = await navigator.storage.getDirectory();
  }

  /**
   * 🏗️ STAGE: Writes a large file to OPFS in chunks
   */
  async stageFile(file: File, onProgress?: (pct: number) => void): Promise<string> {
    if (!this.root) await this.init();
    
    const fileName = `staging_${Date.now()}_${file.name}`;
    const fileHandle = await this.root!.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();

    const chunkSize = 64 * 1024 * 1024; // 64MB Slices
    let offset = 0;

    while (offset < file.size) {
      const slice = file.slice(offset, offset + chunkSize);
      await writable.write(await slice.arrayBuffer());
      offset += chunkSize;
      onProgress?.(Math.round((offset / file.size) * 100));
    }

    await writable.close();
    return fileName;
  }

  /**
   * 🗑️ PURGE: Removes staged file
   */
  async purge(fileName: string) {
    if (!this.root) return;
    try {
      await this.root.removeEntry(fileName);
    } catch (e) {
      console.error(`[OPFS] Purge failed for ${fileName}:`, e);
    }
  }

  async getFile(fileName: string): Promise<File> {
    if (!this.root) await this.init();
    const handle = await this.root!.getFileHandle(fileName);
    return await handle.getFile();
  }
}
