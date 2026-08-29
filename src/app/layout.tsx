import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "PontoEscala",
    template: "%s",
  },
  description: "Gestão de escala e ponto eletrônico para sua equipe.",
};

// O ponto e batido pelo celular: viewport tem que estar certo desde ja.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2f5bff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
