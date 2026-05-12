import { UploadCloud, Copy, Check, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { RoutingService } from '@/core/services/routing';

interface IngestionOperatorProps {
  targetPath: string;
  pattern: string;
  publicUrl?: string | null;
  mode?: 'preview' | 'live';
  className?: string;
}

export function IngestionOperator({ 
  targetPath, 
  pattern, 
  publicUrl, 
  mode = 'preview',
  className 
}: IngestionOperatorProps) {
  const [copied, setCopied] = useState(false);
  const [projectValue, setProjectValue] = useState('taller-tejido');

  const resolvedPath = RoutingService.resolveTemplate(targetPath + '/' + pattern, { 
    project: projectValue 
  });

  const handleCopy = () => {
    if (publicUrl) {
      navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={cn(
      "p-8 rounded-xl space-y-6 animate-in zoom-in-95 duration-500",
      mode === 'preview' ? "bg-primary/5 border border-primary/10 border-dashed" : "bg-card border border-border shadow-lg",
      className
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <UploadCloud className="size-4 text-primary" />
          </div>
          <h4 className="text-xs font-bold uppercase tracking-widest">
            {mode === 'preview' ? 'Operador de Ingesta Inmediata (Preview)' : 'Terminal de Ingesta Pública'}
          </h4>
        </div>
        
        {publicUrl && (
          <button 
            onClick={handleCopy}
            className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-primary hover:underline transition-all"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? 'Copiado' : 'Compartir URL Pública'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-4">
          <div className="p-3 rounded-lg bg-background/50 border border-border shadow-inner">
            <div className="flex items-center gap-2 mb-2">
               <Info className="size-3 text-primary opacity-50" />
               <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">Inyección Proyectada:</p>
            </div>
            <p className="text-[10px] font-mono break-all text-primary bg-primary/5 p-2 rounded border border-primary/10">
              {resolvedPath}
            </p>
          </div>
          
          <div className="space-y-2">
            <Label className="text-[9px] font-bold uppercase tracking-widest opacity-50">Variable Simulada: {`{project}`}</Label>
            <Input 
              value={projectValue}
              onChange={(e) => setProjectValue(e.target.value)}
              placeholder="Ej: taller-tejido" 
              className="h-8 text-xs bg-background border-primary/20" 
            />
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="h-full min-h-[140px] rounded-xl border-2 border-dashed border-primary/20 bg-background/50 flex flex-col items-center justify-center hover:bg-background transition-all cursor-pointer group">
            <UploadCloud className="size-8 text-muted-foreground group-hover:text-primary transition-colors mb-2" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground group-hover:text-foreground">
              {mode === 'preview' ? 'Arrastra archivos para probar' : 'Soltar archivos para iniciar ingesta'}
            </p>
            <div className="mt-2 px-3 py-1 bg-primary/10 rounded-full">
               <p className="text-[8px] text-primary font-bold uppercase tracking-widest">
                  Auto-Routing: {pattern}
               </p>
            </div>
          </div>
        </div>
      </div>
      
      {mode === 'preview' && (
        <div className="pt-2">
          <p className="text-[8px] text-muted-foreground italic text-center uppercase tracking-widest opacity-60">
            🛡️ Axiom Check: Las variables temporalmente resueltas ({new Date().getFullYear()}) son deterministas.
          </p>
        </div>
      )}
    </div>
  );
}
