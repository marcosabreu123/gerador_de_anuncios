import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Artes com IA — Anúncios profissionais em poucos cliques",
  description:
    "Transforme fotos simples de produtos em artes publicitárias prontas para vender no Instagram e WhatsApp.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#16140f" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} h-full antialiased`}
      // O script inline (ver abaixo) define data-theme no client antes do
      // primeiro paint, o que nunca bate com o HTML gerado no servidor —
      // suppressHydrationWarning aqui é o jeito correto de silenciar só
      // esse mismatch esperado (mesma técnica do next-themes), sem afetar
      // o resto da árvore.
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Roda antes do primeiro paint pra aplicar o tema salvo sem
            flash — precisa ser o primeiro elemento do body (ver
            src/lib/theme.ts, mesma técnica do next-themes). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
