# Indra Desktop Storage — Setup Rápido

## Requisitos

- **Node.js 18+** ([Descargar](https://nodejs.org/))
- **npm 9+** (incluido con Node.js)
- **Windows 10+**, **macOS 10.15+**, o **Linux** (Ubuntu 20.04+)
- Mínimo 2GB de espacio libre en disco
- Conexión a internet (para login y sincronización)

## Instalación

### Windows
```
setup.bat
```

### macOS / Linux
```
chmod +x scripts/installer/setup.sh
./scripts/installer/setup.sh
```

## Iniciar Aplicación

```
npm run start
```

La aplicación abrirá automáticamente en http://localhost:3000

## Primeros Pasos

1. **Login**: Ingresa tus credenciales Indra
2. **Conectar Storage**: Agrega Google Drive, R2, OneDrive, etc
3. **Ver Raíz Local**: Ve a "Estado de escritorio" para ver dónde se guardan los archivos
4. **Navega el Explorador**: Visualiza tus almacenamientos conectados

## Solución de Problemas

### Node.js no encontrado
Instala desde https://nodejs.org/ (recomendado: LTS)

### npm install falla
```
npm cache clean --force
npm install
```

### Puerto 3000 ya está en uso
```
PORT=3001 npm run start
```

### Ver logs detallados
```
DEBUG=* npm run start
```

## Ubicación de Datos

- **Windows**: `C:\Users\<usuario>\Indra Drive\<user-id>`
- **macOS**: `/Users/<usuario>/Indra Drive/<user-id>`
- **Linux**: `/home/<usuario>/Indra Drive/<user-id>`

Carpetas internas:
- `incoming/`: Archivos listos para subir
- `cache/`: Cache local de metadatos
- `thumbnails/`: Miniaturas de preview
