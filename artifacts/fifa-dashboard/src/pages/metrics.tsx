import React, { useMemo } from "react";
import { useGetMetricsHistory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Cpu, Server, Zap } from "lucide-react";
import {
  Area, AreaChart, Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const time = new Date(label).toLocaleTimeString();
    return (
      <div className="bg-popover border border-border p-3 shadow-xl rounded-md font-mono text-xs z-50">
        <div className="text-muted-foreground mb-2">{time}</div>
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex justify-between gap-4 py-0.5">
            <span style={{ color: p.color }} className="uppercase">{p.name}</span>
            <span className="font-bold text-foreground">{p.value?.toFixed(1) || 0}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function Metrics() {
  const { data: history } = useGetMetricsHistory({ query: { refetchInterval: 5000 } });

  const chartData = useMemo(() => {
    if (!history) return [];
    return history.map(item => ({
      ...item,
      time: item.timestamp,
    })).sort((a, b) => a.time - b.time);
  }, [history]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1600px] mx-auto pb-10">
      <div>
        <h2 className="text-2xl font-bold tracking-tight uppercase">Telemetry</h2>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          Historical system performance metrics
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* Latency Chart */}
        <Card className="bg-card border-border shadow-lg">
          <CardHeader className="py-4 border-b border-border/50">
            <CardTitle className="text-sm font-mono tracking-widest uppercase flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Avg Latency (ms)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 h-[300px]">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    tickFormatter={(t) => new Date(t).toLocaleTimeString([], {minute:'2-digit', second:'2-digit'})} 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    fontFamily="monospace"
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} fontFamily="monospace" />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="avgLatency" name="Latency" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorLatency)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center font-mono text-xs text-muted-foreground uppercase">Waiting for data...</div>
            )}
          </CardContent>
        </Card>

        {/* RPS Chart */}
        <Card className="bg-card border-border shadow-lg">
          <CardHeader className="py-4 border-b border-border/50">
            <CardTitle className="text-sm font-mono tracking-widest uppercase flex items-center gap-2">
              <Activity className="h-4 w-4 text-success" />
              Requests Per Second
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 h-[300px]">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRps" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    tickFormatter={(t) => new Date(t).toLocaleTimeString([], {minute:'2-digit', second:'2-digit'})} 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    fontFamily="monospace"
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} fontFamily="monospace" />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="step" dataKey="requestsPerSecond" name="RPS" stroke="hsl(var(--success))" fillOpacity={1} fill="url(#colorRps)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center font-mono text-xs text-muted-foreground uppercase">Waiting for data...</div>
            )}
          </CardContent>
        </Card>

        {/* Resources Chart */}
        <Card className="bg-card border-border shadow-lg xl:col-span-2">
          <CardHeader className="py-4 border-b border-border/50">
            <CardTitle className="text-sm font-mono tracking-widest uppercase flex items-center gap-2">
              <Cpu className="h-4 w-4 text-warning" />
              System Resources (%)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 h-[300px]">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    tickFormatter={(t) => new Date(t).toLocaleTimeString([], {minute:'2-digit', second:'2-digit'})} 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    fontFamily="monospace"
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} fontFamily="monospace" domain={[0, 100]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="cpuUsage" name="CPU" stroke="hsl(var(--warning))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="memoryUsage" name="Memory" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center font-mono text-xs text-muted-foreground uppercase">Waiting for data...</div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
