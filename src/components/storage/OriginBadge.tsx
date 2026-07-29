'use client';

import React from 'react';
import * as LucideIcons from 'lucide-react';
import { registry } from '@/core/registry';
import { cn } from '@/lib/utils';

interface OriginBadgeProps {
  provider?: string;
  connectionLabel?: string;
  remotePath?: string;
  size?: 'xs' | 'sm';
  className?: string;
}

/**
 * OriginBadge Component
 *
 * Displays the origin traceability of a file/folder with:
 * - Provider icon (S3, WebDAV, Mega, Local)
 * - Connection label (e.g., "Mi Google Drive")
 * - Remote path in monospace (optional)
 */
export function OriginBadge({
  provider,
  connectionLabel,
  remotePath,
  size = 'xs',
  className
}: OriginBadgeProps) {
  if (!provider) return null;

  const meta = registry.getAdapterMeta(provider);
  const IconComponent = (LucideIcons as unknown as Record<string, React.ElementType>)[meta.icon] || LucideIcons.Database;

  const sizeClasses = {
    xs: 'text-[7px] px-1 py-0.5 gap-0.5 rounded',
    sm: 'text-[8px] px-1.5 py-0.5 gap-1 rounded-md',
  };

  const iconSizes = {
    xs: 'size-2 shrink-0',
    sm: 'size-2.5 shrink-0',
  };

  return (
    <div
      className={cn(
        "inline-flex items-center font-semibold uppercase tracking-wider bg-background/40 text-muted-foreground border border-border/30 transition-all select-none",
        sizeClasses[size],
        className
      )}
      title={`${meta.label}${connectionLabel ? ` - ${connectionLabel}` : ''}${remotePath ? ` - ${remotePath}` : ''}`}
      aria-label={`Origin: ${meta.label}${connectionLabel ? ` - ${connectionLabel}` : ''}${remotePath ? ` - ${remotePath}` : ''}`}
    >
      {/* Icon */}
      <IconComponent className={cn(iconSizes[size], meta.color)} />

      {/* Provider Label */}
      <span className="text-foreground/70 leading-none">
        {meta.label}
      </span>

      {/* Connection Label */}
      {connectionLabel && (
        <span className="text-foreground/50 leading-none">
          /
        </span>
      )}
      {connectionLabel && (
        <span className="text-foreground/60 truncate leading-none">
          {connectionLabel}
        </span>
      )}

      {/* Remote Path (monospace, optional) */}
      {remotePath && (
        <>
          <span className="text-foreground/50 leading-none">
            @
          </span>
          <code className="text-foreground/50 font-mono leading-none truncate">
            {remotePath}
          </code>
        </>
      )}
    </div>
  );
}
