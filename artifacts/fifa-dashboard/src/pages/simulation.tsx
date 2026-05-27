import React from "react";
import { 
  useGetSimulationStatus, 
  useStartSimulation, 
  useStopSimulation,
  getGetSimulationStatusQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Play, Square, Activity, Users, Zap, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function Simulation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: status } = useGetSimulationStatus({ query: { refetchInterval: 2000 } });
  const startSim = useStartSimulation();
  const stopSim = useStopSimulation();

  const handleStart = (intensity: "low"|"medium"|"high"|"surge") => {
    startSim.mutate(
      { data: { intensity } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSimulationStatusQueryKey() });
          toast({ title: `Simulation started`, description: `Intensity set to ${intensity.toUpperCase()}` });
        }
      }
    );
  };

  const handleStop = () => {
    stopSim.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSimulationStatusQueryKey() });
        toast({ title: "Simulation stopped" });
      }
    });
  };

  const isRunning = status?.running || false;

  const intensities: { id: "low"|"medium"|"high"|"surge", label: string, desc: string, color: string }[] = [
    { id: "low", label: "Low Traffic", desc: "Steady trickle of early arrivals", color: "bg-success/20 text-success border-success/30" },
    { id: "medium", label: "Medium", desc: "Normal pre-game crowd flow", color: "bg-primary/20 text-primary border-primary/30" },
    { id: "high", label: "High Volume", desc: "Peak entry time (T-30 mins)", color: "bg-warning/20 text-warning border-warning/30" },
    { id: "surge", label: "Massive Surge", desc: "80,000 fan simultaneous hit", color: "bg-destructive/20 text-destructive border-destructive/30" },
  ];

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight uppercase">Load Generator</h2>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          Stress-test the system with virtual crowd surges
        </p>
      </div>

      <Card className="bg-card border-border shadow-lg">
        <CardHeader className="border-b border-border/50 py-4">
          <CardTitle className="text-sm font-mono tracking-widest uppercase flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Current Status
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-8 items-center justify-between">
            <div className="flex flex-col items-center justify-center flex-1 w-full border border-dashed border-border/50 rounded-lg p-6 bg-muted/5 relative overflow-hidden">
              {isRunning && <div className="absolute inset-0 bg-primary/5 animate-pulse" />}
              <span className="text-xs text-muted-foreground uppercase font-mono mb-2">Virtual Users</span>
              <div className="text-6xl font-bold font-mono tracking-tighter flex items-center gap-4 text-primary">
                {status?.virtualUsers?.toLocaleString() || "0"}
                {isRunning && <Loader2 className="w-8 h-8 animate-spin opacity-50" />}
              </div>
              <div className="mt-4 flex gap-2">
                <Badge variant="outline" className={cn(
                  "font-mono uppercase px-2 py-0 text-[10px]",
                  isRunning ? "bg-primary/20 text-primary border-none" : "bg-muted text-muted-foreground border-none"
                )}>
                  {isRunning ? "RUNNING" : "IDLE"}
                </Badge>
                {isRunning && status?.stage && (
                  <Badge variant="outline" className="font-mono uppercase px-2 py-0 text-[10px] bg-secondary text-secondary-foreground border-none">
                    STAGE: {status.stage}
                  </Badge>
                )}
                {isRunning && status?.intensity && (
                  <Badge variant="outline" className="font-mono uppercase px-2 py-0 text-[10px] bg-warning/20 text-warning border-none">
                    {status.intensity}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex flex-col w-full md:w-48 gap-4 shrink-0">
              <Button 
                variant="destructive"
                className="w-full font-mono uppercase tracking-widest h-12"
                onClick={handleStop}
                disabled={!isRunning || stopSim.isPending}
                data-testid="button-stop-sim"
              >
                <Square className="w-4 h-4 mr-2 fill-current" />
                ABORT SIM
              </Button>
              <div className="text-center text-[10px] text-muted-foreground font-mono">
                Running time: {status?.elapsedSeconds || 0}s
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {intensities.map((preset) => (
          <Card key={preset.id} className={cn(
            "bg-card border transition-all cursor-pointer hover:border-primary/50 relative overflow-hidden",
            isRunning && status?.intensity === preset.id ? preset.color : "border-border"
          )}
          onClick={() => !isRunning && handleStart(preset.id)}
          >
            {isRunning && status?.intensity === preset.id && (
              <div className="absolute inset-0 bg-current opacity-5 animate-pulse" />
            )}
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-bold uppercase tracking-wider">{preset.label}</CardTitle>
              <CardDescription className="text-xs font-mono">{preset.desc}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                variant="outline"
                className="w-full font-mono text-xs uppercase"
                disabled={isRunning || startSim.isPending}
                data-testid={`button-start-sim-${preset.id}`}
                onClick={(e) => { e.stopPropagation(); handleStart(preset.id); }}
              >
                <Play className="w-3 h-3 mr-2" /> Execute {preset.id}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
