import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Indra NEXT",
  title: {
    default: "Indra NEXT",
    template: "%s | Indra NEXT",
  },
  description: "Consola soberana para storage unificado, conexiones y escritorio instalable.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/indra-app-icon.svg",
    shortcut: "/indra-app-icon.svg",
    apple: "/indra-app-icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#111111",
};

import { Providers } from "@/components/providers";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col font-sans">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
