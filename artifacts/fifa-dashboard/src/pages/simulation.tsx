import React from "react";
import { motion } from "framer-motion";
import {
  useGetSimulationStatus,
  useStartSimulation,
  useStopSimulation,
  getGetSimulationStatusQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Play, Square, Zap, Users, Trophy, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const MATCH_SCENARIOS = [
  {
    id: "low",
    name: "Group Stage",
    emoji: "⚽",
    desc: "Calm pre-match atmosphere, steady crowd arrival",
    color: "bg-success/20 text-success border-success/30"
  },
  {
    id: "medium",
    name: "Knockout Round",
    emoji: "⚡",
    desc: "Intense competition, moderate crowd energy",
    color: "bg-primary/20 text-primary border-primary/30"
  },
  {
    id: "high",
    name: "Semi-Finals",
    emoji: "🔥",
    desc: "Peak excitement, high-volume crowd surge",
    color: "bg-warning/20 text-warning border-warning/30"
  },
  {
    id: "surge",
    name: "Championship Match",
    emoji: "💥",
    desc: "Maximum tension, 80,000 fans erupting",
    color: "bg-destructive/20 text-destructive border-destructive/30"
  },
];

export default function Simulation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: status } = useGetSimulationStatus();
  const startSim = useStartSimulation();
  const stopSim = useStopSimulation();

  const handleStart = (intensity: "low" | "medium" | "high" | "surge") => {
    startSim.mutate(
      { data: { intensity } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSimulationStatusQueryKey() });
          toast({
            title: "Match Simulation Started",
            description: `Simulating ${MATCH_SCENARIOS.find(s => s.id === intensity)?.name} scenario...`
          });
        }
      }
    );
  };

  const handleStop = () => {
    stopSim.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSimulationStatusQueryKey() });
        toast({ title: "Match Simulation Ended", description: "Crowd has dispersed" });
      }
    });
  };

  const isRunning = status?.running || false;
  const crowdSize = status?.virtualUsers || 0;
  const crowdPercentage = Math.min((crowdSize / 80000) * 100, 100);

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto pb-10">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight uppercase flex items-center gap-3">
          <span>⚽ Match Simulator</span>
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          Simulate different match scenarios to test stadium operations during tournament
        </p>
      </div>

      {/* Live Status Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="bg-linear-to-r from-card via-card to-secondary/10 border-border shadow-lg">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
              <Zap className="h-4 w-4 text-accent" />
              Live Stadium Status
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Crowd Count */}
              <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border/50 rounded-lg bg-muted/5">
                <span className="text-xs text-muted-foreground uppercase font-mono mb-2">Current Attendance</span>
                <div className="text-5xl font-bold text-primary">
                  {(crowdSize / 1000).toFixed(0)}K
                </div>
                <span className="text-xs text-muted-foreground mt-2">of 80,000 capacity</span>
              </div>

              {/* Stadium Fullness */}
              <div className="flex flex-col justify-between p-6 border border-dashed border-border/50 rounded-lg bg-muted/5">
                <div>
                  <span className="text-xs text-muted-foreground uppercase font-mono mb-3 block">Stadium Occupancy</span>
                  <div className="text-4xl font-bold text-secondary mb-3">{crowdPercentage.toFixed(0)}%</div>
                </div>
                <Progress value={crowdPercentage} className="h-2 bg-card border border-border/50" />
              </div>

              {/* Status Indicator */}
              <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border/50 rounded-lg bg-muted/5">
                {isRunning ? (
                  <>
                    <Loader2 className="w-8 h-8 animate-spin text-accent mb-2" />
                    <span className="text-sm font-bold text-accent uppercase">Match In Progress</span>
                  </>
                ) : (
                  <>
                    <Trophy className="w-8 h-8 text-muted-foreground/50 mb-2" />
                    <span className="text-sm font-bold text-muted-foreground uppercase">Awaiting Match</span>
                  </>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="flex gap-3 pt-4 border-t border-border/30">
              {isRunning && (
                <Button
                  onClick={handleStop}
                  variant="destructive"
                  className="flex items-center gap-2"
                >
                  <Square className="h-4 w-4" />
                  End Simulation
                </Button>
              )}
              {!isRunning && (
                <span className="text-xs text-muted-foreground">Select a scenario to begin</span>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Scenario Selection */}
      <div>
        <h3 className="text-lg font-bold uppercase tracking-wider text-foreground mb-4">Match Scenarios</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MATCH_SCENARIOS.map((scenario, idx) => (
            <motion.div
              key={scenario.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <Card
                className={cn(
                  "border-2 cursor-pointer transition-all hover:shadow-lg hover:scale-105",
                  isRunning && status?.virtualUsers ? "opacity-50 cursor-not-allowed" : ""
                )}
                onClick={() => !isRunning && handleStart(scenario.id as "low" | "medium" | "high" | "surge")}
              >
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="text-4xl">{scenario.emoji}</div>
                    <div>
                      <h4 className="text-sm font-bold uppercase tracking-wider text-foreground">{scenario.name}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{scenario.desc}</p>
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <Badge className={scenario.color}>
                        {scenario.name}
                      </Badge>
                      <Play className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Stadium Insights */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base uppercase tracking-wider">Simulation Insights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg border border-border/30 bg-muted/5">
              <div className="text-sm font-semibold text-muted-foreground uppercase mb-2">Current Stage</div>
              <div className="text-2xl font-bold text-primary">{status?.stage || "—"}</div>
              <p className="text-xs text-muted-foreground mt-1">Current simulation stage</p>
            </div>
            <div className="p-4 rounded-lg border border-border/30 bg-muted/5">
              <div className="text-sm font-semibold text-muted-foreground uppercase mb-2">Elapsed Time</div>
              <div className="text-2xl font-bold text-accent">{status?.elapsedSeconds || 0}s</div>
              <p className="text-xs text-muted-foreground mt-1">Time elapsed in simulation</p>
            </div>
          </div>
          <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
            <p className="text-xs text-muted-foreground">
              💡 Tip: Start with Group Stage to warm up the system, then progress to Championship Match for maximum stress testing. Monitor stadium occupancy and system metrics in real-time.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
