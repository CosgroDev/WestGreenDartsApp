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
  themeColor: "#070d18"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('wgd-appearance-v1')==='light'?'light':'dark';document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='light'?'#f4f7fa':'#0b1220')}catch(e){}` }} />
      </head>
      <body>
        <AppShell>
          {(!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) && <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">Demo mode · Sample players are shown. Connect the team database to save and view real records.</p>}
          {children}
        </AppShell>
      </body>
    </html>
  );
}
