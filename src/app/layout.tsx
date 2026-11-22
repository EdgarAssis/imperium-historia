import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Imperium História",
  description: "Simulador web de geopolítica e de presidência/liderança. Escolhe um país e conduz a tua nação num mundo em mudança.",
  keywords: ["Imperium História", "estratégia", "geopolítica", "simulação", "Next.js", "TypeScript"],
  authors: [{ name: "Imperium História" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Imperium História",
    description: "Simulador de geopolítica e de presidência/liderança.",
    url: "https://chat.z.ai",
    siteName: "Imperium História",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Imperium História",
    description: "Simulador de geopolítica e de presidência/liderança.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-PT" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
