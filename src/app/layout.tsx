import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeShortcut } from '@/components/theme-shortcut';

export const metadata: Metadata = {
  title: 'SHE - Sistema de Horário Escolar',
  description: 'SHE - Sistema de Horário Escolar da SEDUC-TO',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        {/* storageKey novo: ignora o tema que ficou salvo no navegador na época
            do botão de alternar, garantindo modo claro em todas as máquinas. */}
        <ThemeProvider
            attribute="class"
            storageKey="sheto-theme"
            defaultTheme="light"
            enableSystem={false}
            disableTransitionOnChange
        >
            <ThemeShortcut />
            {children}
            <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
