/**
 * PATH UTILS — Indra Sovereign Path Sanitization
 * AXIOMA: Ninguna entrada de usuario puede dictar una ruta de archivo sin pasar
 * por el proceso de normalización y limpieza para evitar Path Traversal y
 * caracteres ilegales en sistemas de archivos (Drive, NTFS, Ext4).
 */

export function sanitizePathSegment(raw: string): string {
  if (!raw) return 'unnamed_segment';

  return raw
    .normalize('NFC')                           // Normalizar Unicode (ej: N-tilde combinada vs pre-compuesta)
    .replace(/[\x00-\x1f\x7f\uff0f\u2215]/g, '') // Eliminar caracteres de control y slashes unicode
    .replace(/[/\\:*?"<>|]/g, '_')             // Reemplazar caracteres ilegales en paths por underscores
    .replace(/^\.+/, '')                        // Prohibir que el segmento empiece con puntos (evita ../ y ocultos)
    .replace(/\.+$/, '')                        // Prohibir que termine con puntos
    .replace(/\s+/g, '_')                       // Espacios -> underscores para URL-safety
    .slice(0, 255);                             // Límite de longitud estándar de sistema de archivos
}

/**
 * Resuelve una ruta completa basándose en un patrón paramétrico.
 */
export function resolveParametricPath(
  pattern: string | undefined,
  basePath: string,
  variables: Record<string, unknown>,
  fileName: string
): string {
  const base = basePath.replace(/\/$/, '');
  
  if (!pattern) return `${base}/${sanitizePathSegment(fileName)}`;

  const today = new Date().toISOString().slice(0, 10);
  const metadata = {
    capture_date: today,
    file_name: fileName
  };

  const resolved = pattern
    .replace(/\{(\w+)\}/g, (_, key: string) => {
      // Prioridad: 1. Variables de formulario | 2. Metadata del sistema
      const val = (variables[key] ?? (metadata as any)[key]) || 'unknown';
      return sanitizePathSegment(String(val));
    })
    .replace(/\/{2,}/g, '/')                    // Colapsar slashes múltiples
    .replace(/^\/|\/$/g, '');                   // Limpiar slashes al inicio/fin

  return `${base}/${resolved}/${sanitizePathSegment(fileName)}`;
}
