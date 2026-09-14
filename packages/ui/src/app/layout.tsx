import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Sidebar from "../components/Sidebar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Barely | AI Testing Platform",
  description: "AI-driven autonomous E2E testing dashboard.",
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} flex h-screen bg-slate-950 text-slate-300 antialiased selection:bg-blue-900/30`}>
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <header className="h-16 flex items-center justify-between px-8 border-b border-slate-800/60 bg-slate-950/50 sticky top-0 z-10 backdrop-blur-sm">
            <h1 className="text-sm font-medium text-slate-400">Barely AI Testing Platform</h1>
            <div className="flex items-center gap-3">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-xs text-slate-400">Agent Online</span>
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
