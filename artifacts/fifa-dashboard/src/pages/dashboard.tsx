import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Zap, Users, TrendingUp, Target, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import {
  useGetCurrentMetrics,
  useGetStadiumCapacity,
  useGetAlerts,
  useScaleServer,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const TEAMS = [
  { name: "Argentina", flag: "🇦🇷", wins: 3, goals: 12 },
  { name: "France", flag: "🇫🇷", wins: 2, goals: 8 },
  { name: "Brazil", flag: "🇧🇷", wins: 3, goals: 14 },
  { name: "England", flag: "🇬🇧", wins: 2, goals: 9 },
  { name: "Spain", flag: "🇪🇸", wins: 2, goals: 10 },
  { name: "Germany", flag: "🇩🇪", wins: 1, goals: 6 },
];

const UPCOMING_MATCHES = [
  { team1: "Argentina", flag1: "🇦🇷", team2: "France", flag2: "🇫🇷", time: "Today 8:00 PM", stadium: "MetLife Stadium" },
  { team1: "Brazil", flag1: "🇧🇷", team2: "Germany", flag2: "🇩🇪", time: "Tomorrow 7:00 PM", stadium: "SoFi Stadium" },
  { team1: "Spain", flag1: "🇪🇸", team2: "England", flag2: "🇬🇧", time: "in 2 days", stadium: "AT&T Stadium" },
];

export default function Dashboard() {
  const { toast } = useToast();

  // Data Polling
  const { data: metrics } = useGetCurrentMetrics({ query: { refetchInterval: 2000 } });
  const { data: capacity } = useGetStadiumCapacity({ query: { refetchInterval: 3000 } });
  const { data: alerts } = useGetAlerts({ query: { refetchInterval: 3000 } });

  const scaleServer = useScaleServer();

  // Map metrics to tournament data
  const attendancePercentage = metrics ? (metrics.cpuUsage || 0) : 0;
  const ticketsSold = Math.round((attendancePercentage / 100) * 75000);
  const averageEngagement = metrics ? Math.round(metrics.memoryUsage || 0) : 0;
  const atmosphereScore = metrics ? Math.round(metrics.errorRate ? 100 - metrics.errorRate * 10 : 95) : 95;

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1600px] mx-auto pb-10">
      
      {/* Hero Section */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-lg border border-border bg-gradient-to-br from-primary/20 via-card to-secondary/20 p-8 md:p-12"
      >
        <div className="absolute inset-0 opacity-10 bg-[linear-gradient(45deg,transparent_25%,rgba(212,165,0,0.1)_25%,rgba(212,165,0,0.1)_50%,transparent_50%,transparent_75%,rgba(212,165,0,0.1)_75%,rgba(212,165,0,0.1))] bg-[length:60px_60px]"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="text-6xl animate-bounce">🏆</div>
            <div>
              <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter text-primary">FIFA WORLD CUP 2026</h1>
              <p className="text-sm text-muted-foreground mt-2 uppercase tracking-wider">Canada • Mexico • USA</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-accent">127 Days</div>
            <p className="text-xs text-muted-foreground">Until Tournament Start</p>
          </div>
        </div>
      </motion.div>

      {/* Key Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-border/50 bg-card/50 hover:bg-card/80 transition-colors">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">Stadium Fill</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-3xl font-bold text-primary">{attendancePercentage.toFixed(0)}%</div>
              <Progress value={attendancePercentage} className="h-2 bg-card border border-border/50" />
              <div className="text-xs text-muted-foreground">{ticketsSold.toLocaleString()} / 75,000 capacity</div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-border/50 bg-card/50 hover:bg-card/80 transition-colors">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">Fan Engagement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-3xl font-bold text-secondary">{averageEngagement}%</div>
              <Progress value={averageEngagement} className="h-2 bg-card border border-border/50" />
              <div className="text-xs text-muted-foreground">Real-time crowd energy level</div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-border/50 bg-card/50 hover:bg-card/80 transition-colors">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">Stadium Atmosphere</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-3xl font-bold text-accent">{atmosphereScore}/100</div>
              <Progress value={atmosphereScore} className="h-2 bg-card border border-border/50" />
              <div className="text-xs text-muted-foreground">Match day experience rating</div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="border-border/50 bg-card/50 hover:bg-card/80 transition-colors">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">System Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-success animate-pulse"></div>
                <span className="text-sm font-semibold text-success">All Systems</span>
              </div>
              <div className="text-xs text-muted-foreground">Operating at peak capacity</div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming Matches */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">Upcoming Matches</h3>
          
          {UPCOMING_MATCHES.map((match, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <Card className="border-border/50 bg-gradient-to-r from-card via-card to-secondary/10 overflow-hidden hover:border-primary/30 transition-colors">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{match.stadium}</div>
                      <div className="text-sm text-accent uppercase tracking-wider font-bold flex items-center gap-2">
                        <Clock className="h-4 w-4" /> {match.time}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 md:gap-6 flex-1 justify-center">
                      <div className="text-center">
                        <div className="text-4xl mb-1">{match.flag1}</div>
                        <div className="text-xs font-bold text-foreground">{match.team1}</div>
                      </div>
                      <div className="text-center px-3">
                        <div className="text-xs font-bold text-muted-foreground uppercase">vs</div>
                      </div>
                      <div className="text-center">
                        <div className="text-4xl mb-1">{match.flag2}</div>
                        <div className="text-xs font-bold text-foreground">{match.team2}</div>
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      className="ml-auto bg-accent hover:bg-accent/80 text-accent-foreground uppercase text-xs font-bold"
                    >
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Live Alerts & Events */}
        <div>
          <h3 className="text-lg font-bold uppercase tracking-wider text-foreground mb-4">Match Events</h3>
          <Card className="border-border/50 bg-card/50 h-full">
            <ScrollArea className="h-[400px]">
              <div className="p-4 space-y-3">
                {!alerts || !Array.isArray(alerts) || alerts.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-muted-foreground text-xs font-mono uppercase">
                    No active events
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {Array.isArray(alerts) && alerts.map((alert) => (
                      <motion.div
                        key={alert.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className={cn(
                          "p-3 rounded-lg border text-xs space-y-1",
                          alert.severity === "critical" && "bg-red-500/10 border-red-500/30",
                          alert.severity === "warning" && "bg-yellow-500/10 border-yellow-500/30",
                          alert.severity === "info" && "bg-blue-500/10 border-primary/30",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {alert.severity === "critical" && <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />}
                          {alert.severity === "warning" && <AlertCircle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />}
                          {alert.severity === "info" && <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                          <span className="font-mono font-semibold text-foreground">{alert.type}</span>
                        </div>
                        <div className="text-muted-foreground line-clamp-2">{alert.message}</div>
                        <div className="text-[10px] text-muted-foreground/50 font-mono">{new Date(alert.timestamp).toLocaleTimeString()}</div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>
      </div>

      {/* Top Teams Standings */}
      <div>
        <h3 className="text-lg font-bold uppercase tracking-wider text-foreground mb-4">Tournament Leaders</h3>
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-0">
            <div className="divide-y divide-border/30">
              {TEAMS.map((team, idx) => (
                <motion.div
                  key={team.name}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="p-4 flex items-center justify-between hover:bg-primary/5 transition-colors group"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="text-2xl">{team.flag}</div>
                    <div className="flex-1">
                      <div className="font-bold text-sm text-foreground">{team.name}</div>
                      <div className="text-xs text-muted-foreground">{team.wins} wins • {team.goals} goals</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <TrendingUp className="h-4 w-4 text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
                    <span className="font-bold text-lg text-primary">{team.wins * 3 + Math.random() * 10 | 0}</span>
                    <span className="text-xs text-muted-foreground">pts</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
