import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bitstack type tool",
  description: "Éditeur de texte courbe — déformez votre texte et exportez en SVG",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
