'use client';

import React from 'react';
import * as LucideIcons from 'lucide-react';
import { registry } from '@/core/registry';
import { cn } from '@/lib/utils';

interface ProviderBadgeProps {
  provider?: string;
  showLabel?: boolean;
  size?: 'xs' | 'sm' | 'md';
  spaceInfo?: { used: number; total: number; free: number } | null;
  className?: string;
}

export function ProviderBadge({
  provider,
  showLabel = false,
  size = 'xs',
  spaceInfo,
  className
}: ProviderBadgeProps) {
  if (!provider) return null;

  const meta = registry.getAdapterMeta(provider);
  // Dynamically lookup lucide icon name
  const IconComponent = (LucideIcons as any)[meta.icon] || LucideIcons.Database;

  const sizeClasses = {
    xs: 'text-[8px] px-1 py-0.5 gap-1 rounded',
    sm: 'text-[10px] px-1.5 py-0.5 gap-1.5 rounded-md',
    md: 'text-xs px-2 py-1 gap-2 rounded-lg',
  };

  const iconSizes = {
    xs: 'size-2.5 shrink-0',
    sm: 'size-3.5 shrink-0',
    md: 'size-4 shrink-0',
  };

  const formattedSpace = spaceInfo 
    ? `(${formatBytes(spaceInfo.used)} / ${formatBytes(spaceInfo.total)})`
    : '';

  return (
    <div
      className={cn(
        "inline-flex items-center font-bold uppercase tracking-wider bg-muted/40 text-muted-foreground border border-border/20 transition-all select-none",
        sizeClasses[size],
        className
      )}
      title={`${meta.label} ${formattedSpace}`}
    >
      {/* Visual active state dot */}
      <span className={cn("rounded-full size-1.5 shrink-0 animate-pulse", meta.accentCss)} />
      
      {/* Icon */}
      <IconComponent className={cn(iconSizes[size], meta.color)} />
      
      {/* Label */}
      {showLabel && (
        <span className="font-semibold text-foreground/80 leading-none">
          {meta.label} <span className="opacity-60 font-normal normal-case">{formattedSpace}</span>
        </span>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes === Infinity) return '∞';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
