import React from "react";
import { motion } from "framer-motion";
import { useGetCurrentMetrics, useGetStadiumCapacity, useGetMetricsHistory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Activity, Award } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function Metrics() {
  const { data: currentMetrics } = useGetCurrentMetrics({ query: { refetchInterval: 5000 } });
  const { data: capacity } = useGetStadiumCapacity({ query: { refetchInterval: 10000 } });
  const { data: history } = useGetMetricsHistory({ query: { refetchInterval: 5000 } });

  const chartData = (history || []).map((s) => ({
    t: new Date(s.timestamp).toLocaleTimeString(),
    avg: s.avgLatency,
    p95: s.p95Latency,
    p99: s.p99Latency,
    rps: s.requestsPerSecond,
    cpu: s.cpuUsage,
  }));

  const tournamentStats = {
    totalMatches: 64,
    completedMatches: 28,
    goalsScored: 89,
    totalAttendance: 1250000,
    averageAttendance: 44642,
  };

  const ticketSalesPct = Math.min(100, Math.round(capacity?.occupancyPercent ?? 0));
  const broadcastQuality = Math.max(0, 100 - (currentMetrics?.errorRate ?? 0) * 5);
  const fanSentiment = Math.max(0, 100 - (currentMetrics?.avgLatency ?? 0) / 50);

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
      value: `${Math.round(capacity?.occupancyPercent || 0)}%`,
      percentage: capacity?.occupancyPercent || 0,
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
    <div className="flex flex-col gap-6 w-full max-w-400 mx-auto pb-10">
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
        <Card className="border-border/50 bg-linear-to-r from-card via-card to-secondary/10">
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
                  <span className="text-lg font-bold text-primary">{ticketSalesPct}%</span>
                </div>
                <div className="w-full h-2 bg-card rounded-full overflow-hidden border border-border/30">
                  <div className="h-full bg-primary" style={{ width: `${ticketSalesPct}%` }}></div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground uppercase">Broadcast Quality</span>
                  <span className="text-lg font-bold text-accent">{broadcastQuality.toFixed(0)}%</span>
                </div>
                <div className="w-full h-2 bg-card rounded-full overflow-hidden border border-border/30">
                  <div className="h-full bg-accent" style={{ width: `${broadcastQuality}%` }}></div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground uppercase">Fan Sentiment</span>
                  <span className="text-lg font-bold text-secondary">{fanSentiment.toFixed(0)}%</span>
                </div>
                <div className="w-full h-2 bg-card rounded-full overflow-hidden border border-border/30">
                  <div className="h-full bg-secondary" style={{ width: `${fanSentiment}%` }}></div>
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
                  <div className="h-full bg-primary transition-all duration-500" style={{ width: `${Math.min(currentMetrics?.cpuUsage || 0, 100)}%` }} />
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground uppercase">Memory</span>
                  <span className="text-lg font-bold text-secondary">{Math.round(currentMetrics?.memoryUsage || 0)}%</span>
                </div>
                <div className="w-full h-2 bg-card rounded-full overflow-hidden border border-border/30">
                  <div className="h-full bg-secondary transition-all duration-500" style={{ width: `${Math.min(currentMetrics?.memoryUsage || 0, 100)}%` }} />
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground uppercase">Error Rate</span>
                  <span className="text-lg font-bold text-success">{(currentMetrics?.errorRate || 0).toFixed(2)}%</span>
                </div>
                <div className="w-full h-2 bg-card rounded-full overflow-hidden border border-border/30">
                  <div className="h-full bg-success transition-all duration-500" style={{ width: `${Math.min((currentMetrics?.errorRate || 0) * 10, 100)}%` }} />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Latency Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wider">Latency (ms)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="avg" stroke="var(--primary)" dot={false} name="Avg" />
                <Line type="monotone" dataKey="p95" stroke="var(--accent)" dot={false} name="p95" />
                <Line type="monotone" dataKey="p99" stroke="var(--destructive)" dot={false} name="p99" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      {/* RPS Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wider">Requests / Second</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="rps" stroke="var(--secondary)" dot={false} name="RPS" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      {/* CPU Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wider">CPU Usage (%)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="cpu" stroke="var(--accent)" dot={false} name="CPU %" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
