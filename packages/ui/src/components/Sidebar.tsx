'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, PlayCircle, Image as ImageIcon, Settings } from 'lucide-react';

const navItems = [
  { href: '/',            label: 'Overview',         icon: LayoutDashboard },
  { href: '/executions',  label: 'Executions',       icon: PlayCircle },
  { href: '/baselines',   label: 'Visual Baselines', icon: ImageIcon },
  { href: '/settings',    label: 'Settings',         icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 flex-shrink-0 border-r border-slate-800/60 bg-slate-950/50 flex flex-col">
      <div className="h-16 flex items-center px-4 border-b border-slate-800/60">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/mascot.png" alt="Barely Mascot" width={36} height={36} className="rounded-md object-contain" />
          <span className="text-slate-100 font-bold text-xl tracking-tight">Barely!</span>
        </Link>
      </div>
      <nav className="flex-1 py-6 px-3 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                active
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-slate-800/60">
        <p className="text-[10px] text-slate-600 font-mono">barely v0.1.0-alpha</p>
      </div>
    </aside>
  );
}
