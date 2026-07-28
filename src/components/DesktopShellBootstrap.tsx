'use client';

import { useEffect } from 'react';

export function DesktopShellBootstrap() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    void navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('[DesktopShellBootstrap] service worker registration failed:', error);
    });
  }, []);

  return null;
}
