#!/bin/bash

echo "Indra Desktop Storage Setup"
echo "============================"
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js no encontrado. Instala desde https://nodejs.org/"
    exit 1
fi

# Instalar dependencias
if [ ! -d "node_modules" ]; then
    echo "Instalando dependencias..."
    npm install
    if [ $? -ne 0 ]; then
        echo "ERROR: No se pudo instalar dependencias"
        exit 1
    fi
fi

# Compilar
if [ ! -d ".next" ]; then
    echo "Compilando aplicacion..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "ERROR: No se pudo compilar"
        exit 1
    fi
fi

# Crear carpeta de datos
mkdir -p "$HOME/.local/share/indra-storage"

echo ""
echo "Setup completado exitosamente!"
echo ""
echo "Para iniciar la aplicacion:"
echo "  npm run start"
echo ""
echo "La aplicacion abrira en http://localhost:3000"
echo ""
