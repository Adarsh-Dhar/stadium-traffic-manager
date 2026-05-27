import React from "react";
import { motion } from "framer-motion";
import { useGetCurrentMetrics } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Activity, Award } from "lucide-react";

export default function Metrics() {
  const { data: currentMetrics } = useGetCurrentMetrics({ query: { refetchInterval: 2000 } });

  const tournamentStats = {
    totalMatches: 64,
    completedMatches: 28,
    goalsScored: 89,
    totalAttendance: 1250000,
    averageAttendance: 44642,
  };

  const statsToDisplay = [
    {
      label: "Tournament Progress",
      value: `${tournamentStats.completedMatches}/${tournamentStats.totalMatches}`,
      percentage: (tournamentStats.completedMatches / tournamentStats.totalMatches) * 100,
      icon: TrendingUp,
      color: "text-primary"
    },
    {
      label: "Total Goals",
      value: tournamentStats.goalsScored.toString(),
      percentage: 89,
      icon: Activity,
      color: "text-accent"
    },
    {
      label: "Avg Stadium Fill",
      value: `${Math.round((currentMetrics?.cpuUsage || 0))}%`,
      percentage: currentMetrics?.cpuUsage || 0,
      icon: Award,
      color: "text-secondary"
    },
    {
      label: "Fan Satisfaction",
      value: `${(95 - (currentMetrics?.errorRate || 0) * 10).toFixed(0)}%`,
      percentage: 95 - (currentMetrics?.errorRate || 0) * 10,
      icon: TrendingUp,
      color: "text-success"
    }
  ];

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1600px] mx-auto pb-10">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-bold tracking-tight uppercase">Tournament Statistics</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Real-time analytics from the FIFA World Cup 2026
            </p>
          </div>
          <Badge className="bg-success text-background uppercase text-xs">Live</Badge>
        </div>
      </motion.div>

      {/* Key Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsToDisplay.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <Card className="border-border/50 bg-card/50 hover:bg-card/80 transition-colors">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{stat.label}</p>
                      <div className="text-3xl font-bold text-foreground mt-2">{stat.value}</div>
                    </div>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div className="w-full h-1 bg-card rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${stat.color.replace("text-", "bg-")}`}
                      style={{ width: `${Math.min(stat.percentage, 100)}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Tournament Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card className="border-border/50 bg-gradient-to-r from-card via-card to-secondary/10">
          <CardHeader>
            <CardTitle className="text-base uppercase tracking-wider">Tournament Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="border-l-2 border-primary pl-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Total Attendance</p>
                <p className="text-2xl font-bold text-primary">{(tournamentStats.totalAttendance / 1000000).toFixed(1)}M</p>
              </div>
              <div className="border-l-2 border-secondary pl-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Avg Per Match</p>
                <p className="text-2xl font-bold text-secondary">{(tournamentStats.averageAttendance / 1000).toFixed(0)}K</p>
              </div>
              <div className="border-l-2 border-accent pl-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Goals Scored</p>
                <p className="text-2xl font-bold text-accent">{tournamentStats.goalsScored}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Stadium Performance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-wider">Game Day Performance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground uppercase">Ticket Sales</span>
                  <span className="text-lg font-bold text-primary">92%</span>
                </div>
                <div className="w-full h-2 bg-card rounded-full overflow-hidden border border-border/30">
                  <div className="w-[92%] h-full bg-primary"></div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground uppercase">Broadcast Quality</span>
                  <span className="text-lg font-bold text-accent">98%</span>
                </div>
                <div className="w-full h-2 bg-card rounded-full overflow-hidden border border-border/30">
                  <div className="w-[98%] h-full bg-accent"></div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground uppercase">Fan Sentiment</span>
                  <span className="text-lg font-bold text-secondary">95%</span>
                </div>
                <div className="w-full h-2 bg-card rounded-full overflow-hidden border border-border/30">
                  <div className="w-[95%] h-full bg-secondary"></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-wider">System Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground uppercase">CPU Usage</span>
                  <span className="text-lg font-bold text-primary">{Math.round(currentMetrics?.cpuUsage || 0)}%</span>
                </div>
                <div className="w-full h-2 bg-card rounded-full overflow-hidden border border-border/30">
                  <div className="w-[45%] h-full bg-primary"></div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground uppercase">Memory</span>
                  <span className="text-lg font-bold text-secondary">{Math.round(currentMetrics?.memoryUsage || 0)}%</span>
                </div>
                <div className="w-full h-2 bg-card rounded-full overflow-hidden border border-border/30">
                  <div className="w-[52%] h-full bg-secondary"></div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground uppercase">Error Rate</span>
                  <span className="text-lg font-bold text-success">{(currentMetrics?.errorRate || 0).toFixed(2)}%</span>
                </div>
                <div className="w-full h-2 bg-card rounded-full overflow-hidden border border-border/30">
                  <div className="w-[8%] h-full bg-success"></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
