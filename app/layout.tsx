import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: "#6366f1",
};

export const metadata: Metadata = {
  title: "ProCRM - Professional Agency Management",
  description: "Manage your clients, quotations, and invoices in one place.",
  // Next.js 16 auto-detects app/icon.svg and emits the right
  // <link rel="icon"> tags, but we set the apple-
  // touch-icon explicitly so mobile browsers also pick up the
  // brand gradient.
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className} suppressHydrationWarning>
        <Toaster position="top-right" richColors />
        {children}
      </body>
    </html>
  );
}
