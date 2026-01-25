import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
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
  maximumScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900">
        <div className="page">
          <div className="brand-bar">
            <Link href="/dashboard" className="brand-link" aria-label="Go to dashboard">
              <Image
                src="/west_green_logo.png"
                alt="West Green Darts"
                width={72}
                height={72}
                className="brand-logo"
                priority
              />
              <span className="brand-wordmark">West Green Darts</span>
            </Link>
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
