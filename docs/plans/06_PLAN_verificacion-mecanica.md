---
plan: 06_PLAN_verificacion-mecanica
estado: LISTO
ejecutor: codex
depende_de: []
---

# 06 - Verificación Mecánica Base (TypeCheck, Lint, Build, Tests)

## Contexto

El repositorio tiene cambios sin verificar en los archivos de desktop y storage. Antes de avanzar a las siguientes fases (3, 4, 5), es obligatorio garantizar que:

1. **TypeScript compila sin errores**: `npx tsc --noEmit`
2. **ESLint no reporta problemas**: `npm run lint`
3. **Build Next.js exitoso**: `npm run build`
4. **Tests de contrato pasan**: `npm run test:contract`

Esta fase establece la línea base de calidad y permite que los agentes de las fases 3-5 trabajen sobre código verificado.

## Operaciones

1. Ejecutar verificación de TypeScript
   ```powershell
   npx tsc --noEmit
   ```
   - Registrar cualquier error de tipo
   - No corregir aún, solo reportar

2. Ejecutar linter
   ```powershell
   npm run lint
   ```
   - Registrar violaciones de estilo
   - Determinar si son auto-corregibles

3. Ejecutar build
   ```powershell
   npm run build
   ```
   - Verificar que Next.js compila
   - Reportar errores de optimización

4. Ejecutar test:contract
   ```powershell
   npm run test:contract
   ```
   - Verificar suites de contrato
   - Reportar fallos

5. Corregir bloqueos en orden de criticidad
   - Primero: errores de tipo (rompen el compilador)
   - Segundo: errores de compilación
   - Tercero: linter warnings (si no son auto-corregibles)
   - Cuarto: test failures

## Prohibiciones

- No cambiar código sin causa verificada
- No ignorar problemas (--force, --no-check, etc)
- No modificar tsconfig.json, eslintrc, vitest.config sin autorización

## Verificación

Criterio de éxito:

```
✅ npx tsc --noEmit (exit 0, sin errores)
✅ npm run lint (exit 0 o solo warnings auto-corregibles)
✅ npm run build (exit 0, build successful)
✅ npm run test:contract (exit 0, tests pass)
```

Si alguno falla, reportar exactamente qué falló y por qué.

## Resultado esperado

Un documento con:
- Status de cada verificación (PASS/FAIL)
- Errores encontrados (si los hay)
- Cambios realizados para fijarlos
- Cambios pendientes que requieren decisión humana
