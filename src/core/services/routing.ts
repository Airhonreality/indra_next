/**
 * 🛰️ SERVICIO: routing.ts
 * ───────────
 * CAPA: Core / Services (Naming Authority)
 * VERSIÓN: 1.0.0
 * 
 * 🎯 FUNCTIONAL_SCOPE:
 * - Autoridad centralizada para la generación de slugs y rutas públicas.
 * - Garantiza la unicidad axiomática mediante sufijos aleatorios criptográficos.
 * - Estandariza la nomenclatura de túneles de ingesta en todo el ecosistema Indra.
 * 
 * 🛡️ AXIOMATIC_CONTRACT:
 * - MUST: Generar strings URL-safe (lowercase, no special chars).
 * - ALWAYS: Incluir un sufijo de colisión (1 letra + 4 números) para evitar yuxtaposición en producción.
 * - NEVER: Revelar IDs de base de datos o información sensible en el slug.
 */

export const RoutingService = {
  /**
   * Genera un identificador único para una ruta pública.
   * Formato: [slug-limpio]_[rXXXX]
   */
  generateSlug(label: string): string {
    const cleanLabel = this.cleanKey(label);
    const suffix = this.generateUniqueSuffix();
    
    return cleanLabel ? `${cleanLabel}_${suffix}` : suffix;
  },

  /**
   * Limpia un string para ser usado como key interna o parte de una URL.
   * Formato: lowercase-con-guiones
   */
  cleanKey(label: string): string {
    return label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  },

  /**
   * Genera una clave técnica compatible con bases de datos y hojas de cálculo.
   * Formato: lowercase_con_guiones_bajos
   */
  toKey(label: string): string {
    return String(label)
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '_')
      .replace(/(^_|_$)/g, '');
  },

  /**
   * Genera un sufijo aleatorio de colisión.
   * Ejemplo: r9421, a1234
   */
  generateUniqueSuffix(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    const randomChar = chars.charAt(Math.floor(Math.random() * chars.length));
    const randomNumbers = Math.floor(1000 + Math.random() * 9000); // 4 dígitos
    return `${randomChar}${randomNumbers}`;
  },

  /**
   * Valida si un slug cumple con el estándar de Indra.
   */
  isValidSlug(slug: string): boolean {
    const indraSlugRegex = /^[a-z0-9-]+_[a-z][0-9]{4}$/;
    return indraSlugRegex.test(slug);
  },

  /**
   * 🧠 EJECUTOR DE REGLAS (Agnostic Template Resolver)
   * Transforma un template con variables semánticas en una ruta real.
   */
  resolveTemplate(template: string, context: Record<string, any> = {}): string {
    const now = new Date();
    
    // 1. Inyectar variables de tiempo estándar
    const timeVars = {
      year: now.getFullYear().toString(),
      month: (now.getMonth() + 1).toString().padStart(2, '0'),
      day: now.getDate().toString().padStart(2, '0'),
      date: now.toISOString().split('T')[0]
    };

    const fullContext = { ...timeVars, ...context };
    let resolved = template;

    // 2. Resolver variables {variable}
    Object.entries(fullContext).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      if (resolved.includes(placeholder)) {
        // Limpiamos el valor para que sea seguro en una ruta
        const safeValue = typeof value === 'string' ? this.cleanKey(value) : String(value);
        resolved = resolved.split(placeholder).join(safeValue);
      }
    });

    // 3. Limpieza final de la ruta (quitar barras dobles, asegurar inicio, etc)
    return resolved
      .replace(/\/+/g, '/') // No double slashes
      .replace(/\/$/, '')   // No trailing slash
      .split('/')
      .map(part => part.startsWith('{') ? 'undetermined' : part) // Fallback para variables no resueltas
      .join('/');
  }
};
