import React, { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Server, ActivitySquare, AlertTriangle, Play, Database, Box } from "lucide-react";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  // Force dark mode
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const navItems = [
    { href: "/", label: "Ops Control", icon: Activity },
    { href: "/simulation", label: "Simulation", icon: Play },
    { href: "/metrics", label: "Telemetry", icon: Database },
  ];

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-mono selection:bg-primary/30">
      <aside className="w-16 md:w-64 border-r border-border bg-sidebar flex flex-col items-center md:items-start z-10 shadow-2xl">
        <div className="h-16 flex items-center justify-center md:justify-start md:px-4 w-full border-b border-border text-primary shrink-0 gap-3">
          <ActivitySquare className="h-6 w-6 shrink-0" />
          <div className="hidden md:flex flex-col">
            <span className="font-bold text-sm tracking-widest uppercase leading-none">STADIUM</span>
            <span className="text-[10px] text-muted-foreground font-mono leading-none">TRAFFIC CONTROL</span>
          </div>
        </div>

        <nav className="flex flex-col w-full py-4 gap-2 px-2 shrink-0">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  isActive ? "bg-sidebar-accent text-primary" : "text-sidebar-foreground"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span className="hidden md:block text-sm font-medium tracking-wide uppercase">{item.label}</span>
                {isActive && (
                  <div className="hidden md:block ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse-glow" />
                )}
              </Link>
            );
          })}
        </nav>
        
        <div className="mt-auto w-full p-4 border-t border-border hidden md:flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>SYS_STATUS</span>
            <span className="text-success font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-glow inline-block" /> ONLINE
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>UPLINK</span>
            <span className="font-mono">SECURE</span>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* CRT Scanline effect overlay */}
        <div className="pointer-events-none absolute inset-0 z-50 opacity-[0.015] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%]"></div>
        <div className="pointer-events-none absolute inset-0 z-50 opacity-10 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]"></div>
        
        <header className="h-16 shrink-0 border-b border-border bg-card/50 backdrop-blur flex items-center px-6 justify-between z-10">
          <div className="flex items-center gap-4">
            <div className="h-4 w-1 bg-primary"></div>
            <h1 className="text-sm font-bold uppercase tracking-widest text-primary/80">Terminal {location.toUpperCase() || '/'}</h1>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>TS:</span>
              <span className="text-foreground">{new Date().toISOString().split('T')[1].slice(0, -1)}</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-6 z-10 relative">
          {children}
        </div>
      </main>
    </div>
  );
}
