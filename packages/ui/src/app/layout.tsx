import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Activity, LayoutDashboard, Settings } from "lucide-react";
import Image from "next/image";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Barely | Control Plane",
  description: "AI-driven autonomous E2E testing dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} flex h-screen bg-slate-950 text-slate-300 antialiased selection:bg-blue-900/30`}>
        {/* Modern SaaS Sidebar */}
        <aside className="w-64 flex-shrink-0 border-r border-slate-800/60 bg-slate-950/50 flex flex-col">
          <div className="h-16 flex items-center px-4 border-b border-slate-800/60">
            <a href="/" className="flex items-center gap-2.5">
              <Image src="/logo.png" alt="Barely Logo" width={36} height={36} className="rounded-md" />
              <span className="text-slate-100 font-semibold tracking-wide">Barely<span className="text-slate-500 font-normal">.ai</span></span>
            </a>
          </div>
          <nav className="flex-1 py-6 px-3 space-y-1">
            <a href="/" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <LayoutDashboard className="w-4 h-4" />
              Executions
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors">
              <Activity className="w-4 h-4" />
              Visual Baselines
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors">
              <Settings className="w-4 h-4" />
              Settings
            </a>
          </nav>
        </aside>
        
        {/* Main Content Area */}
        <main className="flex-1 overflow-auto">
          <header className="h-16 flex items-center justify-between px-8 border-b border-slate-800/60 bg-slate-950/50 sticky top-0 z-10 backdrop-blur-sm">
            <h1 className="text-sm font-medium text-slate-200">Test Executions</h1>
            <div className="flex items-center gap-3">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <span className="text-xs text-slate-400">Agent Idle</span>
            </div>
          </header>
          <div className="p-8">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
