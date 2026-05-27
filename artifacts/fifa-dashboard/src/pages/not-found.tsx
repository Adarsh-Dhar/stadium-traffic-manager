import { AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background text-foreground font-mono">
      <div className="flex flex-col items-center text-center max-w-md border border-border bg-card p-10 rounded-lg shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.02)_50%,transparent_75%)] bg-[length:250%_250%] animate-pulse" />
        <AlertTriangle className="h-16 w-16 text-destructive mb-6" />
        <h1 className="text-4xl font-bold tracking-tighter uppercase mb-2">404</h1>
        <h2 className="text-sm font-bold tracking-widest uppercase text-muted-foreground mb-6">
          Terminal Not Found
        </h2>
        <p className="text-xs text-muted-foreground mb-8 relative z-10">
          The requested operational view does not exist or access is restricted.
        </p>
        <Link href="/" className="relative z-10">
          <Button variant="outline" className="font-mono uppercase text-xs tracking-wider border-primary/50 text-primary hover:bg-primary/10">
            Return to Control
          </Button>
        </Link>
      </div>
    </div>
  );
}
