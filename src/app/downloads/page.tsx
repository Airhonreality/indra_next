'use client';

import { Download, Zap, Lock, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DownloadsPage() {
  const version = '0.1.0';

  const downloads = [
    {
      name: 'Windows (10/11)',
      file: `indra-desktop-v${version}.exe`,
      size: '145 MB',
      icon: '🪟',
      checksum: 'SHA256: 3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a',
      requirements: 'Node.js 18+, 2GB RAM, 500MB disk',
      instructions: [
        '1. Descarga el archivo .exe',
        '2. Ejecuta indra-desktop-v0.1.0.exe',
        '3. Sigue el asistente de instalación',
        '4. El daemon se inicia automáticamente'
      ]
    },
    {
      name: 'Linux (Ubuntu/Debian)',
      file: `indra-desktop_${version}_amd64.deb`,
      size: '142 MB',
      icon: '🐧',
      checksum: 'SHA256: 4g5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b',
      requirements: 'Kernel 5.0+, 2GB RAM, 500MB disk',
      instructions: [
        '1. Descarga el archivo .deb',
        '2. sudo apt install ./indra-desktop_0.1.0_amd64.deb',
        '3. systemctl --user start indra-daemon',
        '4. El daemon está listo'
      ]
    },
    {
      name: 'Linux (AppImage)',
      file: `indra-desktop-${version}.AppImage`,
      size: '148 MB',
      icon: '🐧',
      checksum: 'SHA256: 5h6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c',
      requirements: 'Kernel 4.18+, 2GB RAM, 500MB disk',
      instructions: [
        '1. Descarga el archivo .AppImage',
        '2. chmod +x indra-desktop-0.1.0.AppImage',
        '3. ./indra-desktop-0.1.0.AppImage',
        '4. Sigue el asistente de instalación'
      ]
    }
  ];

  const handleDownload = async (filename: string) => {
    const response = await fetch(`/api/downloads/${filename}`);
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            Descargar Indra Desktop Storage
          </h1>
          <p className="text-xl text-muted-foreground mb-6">
            Versión {version} — Sincronización de almacenamiento virtual multiplataforma
          </p>
          <div className="flex items-center justify-center gap-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Zap className="size-4 text-amber-500" />
              <span>&lt;5s LAN sync</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="size-4 text-emerald-500" />
              <span>End-to-end encryption</span>
            </div>
            <div className="flex items-center gap-2">
              <Settings className="size-4 text-blue-500" />
              <span>100% open source</span>
            </div>
          </div>
        </div>

        {/* Downloads Grid */}
        <div className="grid gap-8 md:grid-cols-1 lg:grid-cols-3 mb-12">
          {downloads.map((download) => (
            <div
              key={download.file}
              className="group rounded-2xl border border-border/40 bg-card p-8 shadow-lg hover:shadow-xl transition-shadow"
            >
              {/* Icon & Name */}
              <div className="flex items-center gap-4 mb-6">
                <span className="text-4xl">{download.icon}</span>
                <div>
                  <h3 className="text-xl font-bold">{download.name}</h3>
                  <p className="text-sm text-muted-foreground">{download.size}</p>
                </div>
              </div>

              {/* Requirements */}
              <div className="mb-6 rounded-lg bg-muted/50 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  Requisitos
                </p>
                <p className="text-sm text-foreground">{download.requirements}</p>
              </div>

              {/* Download Button */}
              <Button
                onClick={() => handleDownload(download.file)}
                className="w-full mb-6 h-11 rounded-xl bg-primary text-primary-foreground font-bold uppercase tracking-widest"
              >
                <Download className="mr-2 size-4" />
                Descargar {download.size}
              </Button>

              {/* Checksum */}
              <div className="mb-6 rounded-lg bg-muted/30 p-3 border border-border/30">
                <p className="text-xs font-mono text-muted-foreground break-all">
                  {download.checksum}
                </p>
              </div>

              {/* Instructions */}
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Instalación
                </p>
                <ol className="space-y-2">
                  {download.instructions.map((instruction, idx) => (
                    <li key={idx} className="text-sm text-foreground/80">
                      {instruction}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ))}
        </div>

        {/* Info Section */}
        <div className="rounded-2xl border border-border/40 bg-muted/20 p-8">
          <h2 className="text-2xl font-bold mb-6">¿Qué es Indra Desktop Storage?</h2>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="font-bold mb-3 flex items-center gap-2">
                <span className="text-lg">📁</span>
                Carpeta Virtual
              </h3>
              <p className="text-muted-foreground">
                Crea una carpeta en tu sistema operativo (~/Indra Drive) que se sincroniza automáticamente con otros equipos. Sin consumir espacio real.
              </p>
            </div>

            <div>
              <h3 className="font-bold mb-3 flex items-center gap-2">
                <span className="text-lg">⚡</span>
                Sincronización Rápida
              </h3>
              <p className="text-muted-foreground">
                Los cambios se sincronizan en menos de 5 segundos en la misma red. Usa gRPC + TLS 1.3 para máxima velocidad y seguridad.
              </p>
            </div>

            <div>
              <h3 className="font-bold mb-3 flex items-center gap-2">
                <span className="text-lg">🔒</span>
                Encriptación End-to-End
              </h3>
              <p className="text-muted-foreground">
                Todos los datos se encriptan en tránsito con TLS 1.3. Device pairing con HMAC-SHA256. Tu privacidad es prioritaria.
              </p>
            </div>

            <div>
              <h3 className="font-bold mb-3 flex items-center gap-2">
                <span className="text-lg">🌍</span>
                Multi-Dispositivo
              </h3>
              <p className="text-muted-foreground">
                Sincroniza entre 2-100+ dispositivos. Detección automática de conflictos. Last-Write-Wins o resolución manual.
              </p>
            </div>

            <div>
              <h3 className="font-bold mb-3 flex items-center gap-2">
                <span className="text-lg">💾</span>
                FastCDC + BLAKE3
              </h3>
              <p className="text-muted-foreground">
                Algoritmo de chunking inteligente que detecta cambios mínimos. Deduplicación automática. 85-95% menos transferencia.
              </p>
            </div>

            <div>
              <h3 className="font-bold mb-3 flex items-center gap-2">
                <span className="text-lg">📖</span>
                Open Source
              </h3>
              <p className="text-muted-foreground">
                Código fuente completo en Rust. Comunidad activa. Auditoría de seguridad independiente. AGPL v3.
              </p>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-12 rounded-2xl border border-border/40 bg-card p-8">
          <h2 className="text-2xl font-bold mb-8">Preguntas Frecuentes</h2>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="font-bold mb-2">¿Qué navegadores soporta?</h3>
              <p className="text-sm text-muted-foreground">
                La app está disponible para Windows 10+, Linux (kernel 5.0+) y macOS. No requiere navegador después de instalar.
              </p>
            </div>

            <div>
              <h3 className="font-bold mb-2">¿Cómo emparejar 2 equipos?</h3>
              <p className="text-sm text-muted-foreground">
                Abre la app en Equipo A → "Agregar dispositivo" → Escanea QR en Equipo B. Listo. Sin configuración compleja.
              </p>
            </div>

            <div>
              <h3 className="font-bold mb-2">¿Qué pasa si pierdo conexión?</h3>
              <p className="text-sm text-muted-foreground">
                Los cambios se colean localmente. Cuando vuelva la conexión, se sincronizan automáticamente. Cero data loss.
              </p>
            </div>

            <div>
              <h3 className="font-bold mb-2">¿Cuántos dispositivos puedo sincronizar?</h3>
              <p className="text-sm text-muted-foreground">
                Teóricamente 100+. Recomendamos 2-10 para máximo rendimiento. Más dispositivos = más heartbeats.
              </p>
            </div>

            <div>
              <h3 className="font-bold mb-2">¿Puedo usar en red WAN (internet)?</h3>
              <p className="text-sm text-muted-foreground">
                Sí, pero requiere configuración de firewall y Port Forwarding. LAN local es mucho más simple.
              </p>
            </div>

            <div>
              <h3 className="font-bold mb-2">¿Cómo desinstalo?</h3>
              <p className="text-sm text-muted-foreground">
                Windows: Panel de Control → Desinstalar. Linux: sudo apt remove indra-daemon. Los archivos se preservan.
              </p>
            </div>
          </div>
        </div>

        {/* Support */}
        <div className="mt-12 text-center">
          <p className="text-muted-foreground mb-6">
            ¿Necesitas ayuda? Revisa la documentación o abre un issue en GitHub.
          </p>
          <div className="flex justify-center gap-4">
            <Button variant="outline" className="rounded-xl">
              Documentación
            </Button>
            <Button variant="outline" className="rounded-xl">
              GitHub
            </Button>
            <Button variant="outline" className="rounded-xl">
              Soporte
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
