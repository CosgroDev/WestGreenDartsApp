import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import "../app/globals.css";

export const metadata: Metadata = {
  title: "West Green Darts",
  description: "Mobile-first darts team manager for West Green Darts",
  icons: {
    icon: "/west_green_logo.png",
    shortcut: "/west_green_logo.png",
    apple: "/west_green_logo.png"
  }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#070d18"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
