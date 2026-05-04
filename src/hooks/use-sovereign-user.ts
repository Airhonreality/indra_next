'use client';

import { useState, useEffect } from 'react';

/**
 * SOVEREIGN USER HOOK
 * Manages the identity of the current Indra user.
 * In a full production build, this would pull from Auth.js / Clerk / Supabase.
 * For now, it manages a local sovereign identity that persists in localStorage.
 */
export function useSovereignUser() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Axioma: La identidad del usuario es la raíz de todas las conexiones (Nango connectionId)
    const stored = localStorage.getItem('indra_sovereign_id');
    if (stored) {
      setUserId(stored);
    } else {
      // Default identity for first-time setup
      const newId = 'sovereign_user_01';
      localStorage.setItem('indra_sovereign_id', newId);
      setUserId(newId);
    }
    setIsLoaded(true);
  }, []);

  const updateIdentity = (newId: string) => {
    localStorage.setItem('indra_sovereign_id', newId);
    setUserId(newId);
    window.location.reload(); // Refresh to re-initialize all integrations with new ID
  };

  return { userId, isLoaded, updateIdentity };
}
