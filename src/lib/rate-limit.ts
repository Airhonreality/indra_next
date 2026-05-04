/**
 * RATE LIMITER — Indra Sovereign Defense
 * AXIOMA: Los endpoints públicos son vectores de ataque.
 * Este limitador protege la base de datos y el storage de inundaciones (flood).
 */

const counters = new Map<string, { count: number; resetAt: number }>();

/**
 * Verifica si una IP ha excedido su cuota en una ventana de tiempo.
 * @param ip Identificador del cliente
 * @param limit Máximo de peticiones permitidas
 * @param windowMs Ventana de tiempo en milisegundos
 */
export function checkRateLimit(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = counters.get(ip);

  // Si no existe o la ventana ya expiró, resetear
  if (!entry || now > entry.resetAt) {
    counters.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  // Si excedió el límite
  if (entry.count >= limit) {
    return false;
  }

  // Incrementar contador
  entry.count++;
  return true;
}

/**
 * Limpieza periódica de la memoria (opcional, para evitar fugas si hay millones de IPs)
 */
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of counters.entries()) {
      if (now > entry.resetAt) counters.delete(ip);
    }
  }, 10 * 60 * 1000); // Cada 10 minutos
}
