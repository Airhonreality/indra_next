'use client';

import { SessionProvider } from "next-auth/react";
import { DesktopShellBootstrap } from "@/components/DesktopShellBootstrap";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <DesktopShellBootstrap />
      {children}
    </SessionProvider>
  );
}
