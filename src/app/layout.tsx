import type { Metadata, Viewport } from "next";
import { Urbanist } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Altum CRM", template: "%s · Altum CRM" },
  description: "CRM para times comerciais: funis, contatos, tarefas e atendimento em um só lugar.",
  applicationName: "Altum CRM",
};

export const viewport: Viewport = {
  themeColor: "#0b0d0c",
  width: "device-width",
  initialScale: 1,
};

/** Aplica o tema salvo antes da hidratação para evitar flash de tema errado. */
const themeScript = `try{var t=localStorage.getItem('altum:theme');t=t?JSON.parse(t):'escuro';var l=t==='claro'||(t==='sistema'&&window.matchMedia('(prefers-color-scheme: light)').matches);if(l)document.documentElement.setAttribute('data-theme','light')}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${urbanist.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
