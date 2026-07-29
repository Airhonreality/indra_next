# Estrategia de Actualización: Indra Desktop Storage

## 🔄 Cómo Funciona

### Flujo de Actualización

```
1. Desarrollo en rama main/feature
   ↓
2. Tag git: git tag v0.1.1
   ↓
3. Push tag a GitHub
   ↓
4. GitHub Actions compila automáticamente:
   - Windows: indra-desktop-v0.1.1.exe
   - Linux: indra-desktop_0.1.1_amd64.deb
   - macOS: Indra.Desktop.dmg
   ↓
5. Crea Release automáticamente
   ↓
6. App detecta nueva versión vía API:
   GET /api/daemon/update/windows/x86_64
   ↓
7. Descarga en background
   ↓
8. Instala y reinicia automáticamente
   ↓
9. ✓ Usuario tiene v0.1.1
```

---

## 📦 Versionado Semántico

Usamos **Semantic Versioning**: `MAJOR.MINOR.PATCH`

```
v0.1.0 (actual)
  ├─ MAJOR=0 (pre-release)
  ├─ MINOR=1 (features)
  └─ PATCH=0 (bugfixes)

v0.1.1 - Bugfix release
v0.2.0 - Nuevo feature
v1.0.0 - Primera versión estable
```

### Cuándo cambiar qué:

| Cambio | Incrementar | Ejemplo |
|--------|-------------|---------|
| **Bugfix** | PATCH | 0.1.0 → 0.1.1 |
| **Nuevo feature** | MINOR | 0.1.0 → 0.2.0 |
| **Breaking change** | MAJOR | 0.1.0 → 1.0.0 |

---

## 🚀 Crear Nueva Versión

### Paso 1: Cambios de código

```bash
# En rama main
git add .
git commit -m "feat: nueva característica"
```

### Paso 2: Crear tag

```bash
# Tag semántico
git tag v0.1.1

# Push tag
git push origin v0.1.1
```

### Paso 3: GitHub Actions compila automáticamente

- Ejecuta `.github/workflows/release.yml`
- Compila en Windows, Linux, macOS
- Crea Release automáticamente
- Sube binarios a GitHub Releases

### Paso 4: App detecta y actualiza automáticamente

- Cada 6 horas, app chequea `/api/daemon/update/...`
- Si hay versión nueva, descarga en background
- Notifica al usuario
- Reinicia con nuevo código

---

## 📋 Archivos Involucrados

### Package.json (versión actual)
```json
{
  "version": "0.1.0"
}
```

### tauri.conf.json (updater config)
```json
{
  "updater": {
    "active": true,
    "endpoints": [
      "https://api.indra.app/api/daemon/update/{{target}}/{{arch}}"
    ]
  }
}
```

### GitHub Actions (.github/workflows/release.yml)
- Compila binarios cuando se hace push de tag
- Crea Release automáticamente
- Sube a GitHub Releases

### API Endpoint (/api/daemon/update/[target]/[arch])
- Retorna latest version info
- Mapea versiones a URLs de descarga
- Formato compatible con Tauri updater

### Update Manager (src/update.rs)
- `init_auto_update()` - Chequea cada 6 horas
- `trigger_update()` - Descarga e instala manual
- Maneja reinicio automático

---

## 🔐 Seguridad (Signing)

### Firmas digitales (TODO - implementar después)

```bash
# Generar key
tauri signer generate -w ~/update_key.dat

# Firmar release
tauri signer sign ../path/to/binary --secret-key ~/update_key.dat
```

Esto asegura que solo binarios firmados por ti se instalen.

---

## 📊 Versiones Publicadas

```
Historial de releases:
v0.1.0 - Lanzamiento inicial
  ├─ Windows: indra-desktop-v0.1.0.exe
  ├─ Linux: indra-desktop_0.1.0_amd64.deb
  └─ macOS: Indra.Desktop.dmg

v0.1.1 - Bugfix (cuando se cree)
v0.2.0 - Nuevo feature (cuando se cree)
```

---

## 💡 Ejemplo: Workflow Completo

### Hoy: v0.1.0 está deployed

```
Usuario A: Descargó v0.1.0 hace 1 semana
Usuario B: Descargó v0.1.0 hace 2 días
```

### Mañana: Necesitamos bugfix

```bash
# 1. Fix en código
vim src/lib/sync.rs  # Arreglamos bug

# 2. Commit
git commit -m "fix: sync race condition in multi-device"

# 3. Tag
git tag v0.1.1
git push origin v0.1.1

# 4. GitHub Actions compila automáticamente
# → release creada en GitHub
# → binarios en GitHub Releases

# 5. Users reciben actualización automáticamente
# Cuando checkean cada 6 horas:
# GET /api/daemon/update/windows/x86_64
# Response: v0.1.1 disponible
# → Descarga en background
# → Instala
# → Reinicia
```

### Resultado: Todos tienen v0.1.1 en 24h

Sin que el usuario haga nada. ✨

---

## 🛠️ Operación Manual (si necesitas)

### Check manual en app

```typescript
// En React component
const checkUpdate = async () => {
  const update = await checkUpdate();
  if (update.shouldUpdate) {
    alert(`Nueva versión disponible: ${update.latestVersion}`);
    installUpdate();
  }
};
```

### Trigger actualización manual

```
Menu → Help → Check for Updates
→ Descarga e instala si hay nueva versión
```

---

## 📝 Checklist: Release nuevo

- [ ] Cambios de código en rama (git commit)
- [ ] Actualizar `package.json` version field
- [ ] Actualizar `tauri.conf.json` version field
- [ ] Crear tag: `git tag vX.Y.Z`
- [ ] Push tag: `git push origin vX.Y.Z`
- [ ] Esperar GitHub Actions (5-10 min)
- [ ] Verificar Release en GitHub
- [ ] Verificar binarios se descargaron
- [ ] ✓ App automáticamente se actualiza

---

## ⚙️ Configuración en Production

Cambiar endpoint a tu dominio:

```json
// tauri.conf.json
{
  "updater": {
    "endpoints": [
      "https://api.indra.app/api/daemon/update/{{target}}/{{arch}}"
    ]
  }
}
```

El endpoint retorna JSON compatible con Tauri:

```json
{
  "version": "0.1.1",
  "notes": "Changelog aquí",
  "pub_date": "2024-01-01T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "url": "https://...",
      "signature": "..."
    }
  }
}
```

---

**¡Sistema de updates completamente automatizado!** 🚀
