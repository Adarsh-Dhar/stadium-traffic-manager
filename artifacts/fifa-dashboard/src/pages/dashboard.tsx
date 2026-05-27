import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Server, Cpu, Activity, AlertTriangle, Zap, ServerCrash, 
  RotateCcw, Power, ShieldAlert, CheckCircle2, QrCode,
  ActivitySquare, Link as LinkIcon, Clock, Wrench
} from "lucide-react";
import { 
  useGetCurrentMetrics, 
  useGetStadiumCapacity, 
  useGetAlerts,
  useScaleServer,
  useResetSystem,
  useAiAnalyze,
  useValidateTicket,
  useGetMcpStatus,
  getGetCurrentMetricsQueryKey,
  getGetAlertsQueryKey,
  getGetStadiumCapacityQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const ticketFormSchema = z.object({
  ticketId: z.string().min(1, "Ticket ID is required"),
  userId: z.string().min(1, "User ID is required"),
});

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Data Polling
  const { data: metrics } = useGetCurrentMetrics({ query: { refetchInterval: 2000 } });
  const { data: capacity } = useGetStadiumCapacity({ query: { refetchInterval: 3000 } });
  const { data: alerts } = useGetAlerts({ query: { refetchInterval: 3000 } });
  const { data: mcpStatus } = useGetMcpStatus({ query: { refetchInterval: 10000 } });

  // Mutations
  const scaleServer = useScaleServer();
  const resetSystem = useResetSystem();
  const aiAnalyze = useAiAnalyze();
  const validateTicket = useValidateTicket();

  const handleScaleServer = (action: "add-server" | "remove-server") => {
    scaleServer.mutate(
      { data: { action } },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getGetCurrentMetricsQueryKey() });
          toast({
            title: `Server ${action === "add-server" ? "added" : "removed"}`,
            description: `Active servers: ${data.activeServers}`,
            variant: "default",
          });
        },
        onError: () => {
          toast({
            title: "Scaling failed",
            description: "Could not execute scaling action.",
            variant: "destructive",
          });
        }
      }
    );
  };

  const handleReset = () => {
    resetSystem.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCurrentMetricsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStadiumCapacityQueryKey() });
        toast({
          title: "System Reset",
          description: "All metrics and state have been cleared.",
        });
      }
    });
  };

  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const handleAiAnalyze = () => {
    setAiAnalyzing(true);
    aiAnalyze.mutate(undefined, {
      onSuccess: (data) => {
        setAiAnalyzing(false);
        queryClient.invalidateQueries({ queryKey: getGetCurrentMetricsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
        
        toast({
          title: "AI Analysis Complete",
          description: `Confidence: ${(data.confidence * 100).toFixed(1)}%. ${data.actions.length > 0 ? "Actions applied." : "No actions needed."}`,
          variant: "default",
        });
      },
      onError: () => {
        setAiAnalyzing(false);
        toast({
          title: "AI Analysis Failed",
          variant: "destructive",
        });
      }
    });
  };

  const form = useForm<z.infer<typeof ticketFormSchema>>({
    resolver: zodResolver(ticketFormSchema),
    defaultValues: {
      ticketId: "",
      userId: "",
    },
  });

  const onSubmitTicket = (values: z.infer<typeof ticketFormSchema>) => {
    validateTicket.mutate(
      { data: values },
      {
        onSuccess: (result) => {
          toast({
            title: result.valid ? "Ticket Valid" : "Ticket Invalid",
            description: result.valid ? "Processing successful." : (result.error || "Unknown error"),
            variant: result.valid ? "default" : "destructive",
          });
          if (result.valid) form.reset();
        }
      }
    );
  };

  const isOverloaded = metrics ? metrics.cpuUsage > 85 || metrics.memoryUsage > 85 || metrics.errorRate > 5 : false;

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1600px] mx-auto pb-10">
      
      {/* Top action bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-border/50 pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight uppercase">Control Center</h2>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Real-time traffic & capacity management
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline" 
            size="sm"
            className="font-mono text-xs border-dashed"
            onClick={() => handleScaleServer("remove-server")}
            disabled={scaleServer.isPending || (metrics?.activeServers || 0) <= 1}
            data-testid="button-remove-server"
          >
            - SERVER
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            className="font-mono text-xs border-dashed"
            onClick={() => handleScaleServer("add-server")}
            disabled={scaleServer.isPending}
            data-testid="button-add-server"
          >
            + SERVER
          </Button>
          <Button 
            variant="destructive" 
            size="sm"
            className="font-mono text-xs bg-destructive/20 text-destructive hover:bg-destructive hover:text-white"
            onClick={handleReset}
            disabled={resetSystem.isPending}
            data-testid="button-reset"
          >
            <RotateCcw className="w-3 h-3 mr-2" />
            SYS RESET
          </Button>
          <Button 
            size="sm"
            className={cn(
              "font-mono text-xs relative overflow-hidden transition-all duration-300",
              aiAnalyzing ? "bg-primary/50 text-primary-foreground" : "bg-primary text-primary-foreground",
              "hover:bg-primary/80"
            )}
            onClick={handleAiAnalyze}
            disabled={aiAnalyze.isPending || aiAnalyzing}
            data-testid="button-ai-analyze"
          >
            {aiAnalyzing && (
              <motion.div 
                className="absolute inset-0 bg-white/20"
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              />
            )}
            <Zap className={cn("w-3 h-3 mr-2", aiAnalyzing && "animate-pulse")} />
            AI AUTO-HEAL
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* System Telemetry */}
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard 
            title="CPU Load" 
            value={metrics?.cpuUsage ? `${metrics.cpuUsage.toFixed(1)}%` : "--"} 
            icon={Cpu}
            alert={metrics ? metrics.cpuUsage > 80 : false}
            critical={metrics ? metrics.cpuUsage > 90 : false}
          />
          <MetricCard 
            title="Memory" 
            value={metrics?.memoryUsage ? `${metrics.memoryUsage.toFixed(1)}%` : "--"} 
            icon={Activity}
            alert={metrics ? metrics.memoryUsage > 80 : false}
            critical={metrics ? metrics.memoryUsage > 90 : false}
          />
          <MetricCard 
            title="AVG Latency" 
            value={metrics?.avgLatency ? `${Math.round(metrics.avgLatency)}ms` : "--"} 
            icon={Zap}
            alert={metrics ? metrics.avgLatency > 500 : false}
            critical={metrics ? metrics.avgLatency > 1000 : false}
          />
          <MetricCard 
            title="P95 Latency" 
            value={metrics?.p95Latency ? `${Math.round(metrics.p95Latency)}ms` : "--"} 
            icon={Zap}
            alert={metrics ? metrics.p95Latency > 1500 && metrics.k6P95Pass : false}
            critical={metrics ? !metrics.k6P95Pass : false}
            badge={metrics ? (
              metrics.k6P95Pass ? 
                <Badge className="bg-success/20 text-success hover:bg-success/20 text-[9px] px-1 py-0 h-4 border-none">&lt; 2s</Badge> : 
                <Badge className="bg-destructive/20 text-destructive hover:bg-destructive/20 text-[9px] px-1 py-0 h-4 border-none animate-pulse">BREACH</Badge>
            ) : null}
          />
          <MetricCard 
            title="P99 Latency" 
            value={metrics?.p99Latency ? `${Math.round(metrics.p99Latency)}ms` : "--"} 
            icon={Zap}
            alert={metrics ? metrics.p99Latency > 4000 && metrics.k6P99Pass : false}
            critical={metrics ? !metrics.k6P99Pass : false}
            badge={metrics ? (
              metrics.k6P99Pass ? 
                <Badge className="bg-success/20 text-success hover:bg-success/20 text-[9px] px-1 py-0 h-4 border-none">&lt; 5s</Badge> : 
                <Badge className="bg-destructive/20 text-destructive hover:bg-destructive/20 text-[9px] px-1 py-0 h-4 border-none animate-pulse">BREACH</Badge>
            ) : null}
          />
          <MetricCard 
            title="RPS" 
            value={metrics?.requestsPerSecond ? Math.round(metrics.requestsPerSecond).toString() : "--"} 
            icon={Activity}
          />
          <MetricCard 
            title="Servers" 
            value={metrics?.activeServers?.toString() || "--"} 
            icon={Server}
          />
          <MetricCard 
            title="Error Rate" 
            value={metrics?.errorRate ? `${metrics.errorRate.toFixed(2)}%` : "--"} 
            icon={ServerCrash}
            alert={metrics ? metrics.errorRate > 2 : false}
            critical={metrics ? metrics.errorRate > 5 : false}
          />
          
          {/* Overload indicator */}
          <div className={cn(
            "col-span-2 md:col-span-4 rounded-lg border flex flex-col items-center justify-center p-4 transition-colors",
            isOverloaded ? "bg-destructive/10 border-destructive animate-flash-red" : "bg-card border-border"
          )}>
            <div className="flex items-center gap-2">
              {isOverloaded ? <AlertTriangle className="text-destructive h-5 w-5 animate-pulse" /> : <CheckCircle2 className="text-success h-5 w-5" />}
              <span className={cn("font-bold tracking-widest uppercase text-sm", isOverloaded ? "text-destructive" : "text-success")}>
                {isOverloaded ? "SYSTEM OVERLOAD DETECTED" : "SYSTEM STABLE"}
              </span>
            </div>
            {isOverloaded && (
              <span className="text-[10px] font-mono text-muted-foreground mt-1 uppercase">
                Ai auto-heal recommended
              </span>
            )}
          </div>
        </div>

        {/* Sidebar: AI Action Feed and MCP Bridge Status */}
        <div className="flex flex-col gap-4">
          <Card className="bg-card border-border flex flex-col shadow-lg overflow-hidden h-[240px]">
            <CardHeader className="py-3 px-4 border-b border-border/50 bg-muted/20 shrink-0">
              <CardTitle className="text-xs font-mono tracking-widest uppercase flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-primary" />
                  Alert Feed
                </span>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
              </CardTitle>
            </CardHeader>
            <ScrollArea className="flex-1 p-0">
              <div className="flex flex-col">
                {!alerts || alerts.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-muted-foreground text-xs font-mono uppercase">
                    No active alerts
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {alerts.map((alert) => (
                      <motion.div
                        key={alert.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="p-3 border-b border-border/50 text-sm hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <Badge variant="outline" className={cn(
                            "text-[10px] uppercase font-mono rounded-sm border-none px-1.5 py-0",
                            alert.severity === 'critical' ? "bg-destructive/20 text-destructive" :
                            alert.severity === 'warning' ? "bg-warning/20 text-warning" : "bg-primary/20 text-primary"
                          )}>
                            {alert.severity}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {new Date(alert.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="font-bold text-xs uppercase tracking-wide mb-1">{alert.title}</div>
                        <div className="text-muted-foreground text-[11px] leading-tight mb-2">
                          {alert.message}
                        </div>
                        {alert.aiAction && (
                          <div className="bg-primary/10 border border-primary/20 rounded p-1.5 text-[10px] font-mono text-primary flex items-start gap-1.5">
                            <Zap className="h-3 w-3 shrink-0 mt-0.5" />
                            <span>{alert.aiAction}</span>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </ScrollArea>
          </Card>

          {/* MCP Bridge Status Widget */}
          <Card className="bg-card border-border flex flex-col shadow-lg overflow-hidden shrink-0">
            <CardHeader className="py-3 px-4 border-b border-border/50 bg-muted/20 shrink-0">
              <CardTitle className="text-xs font-mono tracking-widest uppercase flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-primary" />
                  MCP Bridge
                </span>
                <span className="flex items-center gap-2">
                  <span className={cn("text-[10px] font-bold tracking-wider",
                    mcpStatus?.status === "connected" ? "text-success" :
                    mcpStatus?.status === "simulated" ? "text-warning" : "text-destructive"
                  )}>
                    {mcpStatus?.status ? mcpStatus.status.toUpperCase() : "DISCONNECTED"}
                  </span>
                  <span className={cn("flex h-2 w-2 relative rounded-full",
                    mcpStatus?.status === "connected" ? "bg-success" :
                    mcpStatus?.status === "simulated" ? "bg-warning" : "bg-destructive"
                  )}>
                  </span>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex flex-col gap-4 text-sm font-mono bg-black/40">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Activity className="h-3 w-3" /> Events Forwarded
                </span>
                <span className="font-bold text-foreground">{mcpStatus?.eventsForwarded || 0}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Clock className="h-3 w-3" /> Last Ping
                </span>
                <span className="text-foreground">
                  {mcpStatus?.lastPing ? `${Math.round((Date.now() - mcpStatus.lastPing) / 1000)}s ago` : "--"}
                </span>
              </div>
              <div className="space-y-2">
                <span className="text-muted-foreground flex items-center gap-2 text-xs">
                  <Wrench className="h-3 w-3" /> Tools Available ({mcpStatus?.toolsAvailable?.length || 0})
                </span>
                <ScrollArea className="h-[60px] w-full rounded border border-border/50 bg-background/50 p-2">
                  {mcpStatus?.toolsAvailable?.map(tool => (
                    <div key={tool} className="text-[10px] text-primary/80 mb-1 last:mb-0">
                      &gt; {tool}
                    </div>
                  ))}
                  {(!mcpStatus?.toolsAvailable || mcpStatus.toolsAvailable.length === 0) && (
                    <div className="text-[10px] text-muted-foreground">&gt; No tools active</div>
                  )}
                </ScrollArea>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>

      {/* Stadium Capacity & Gates */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Capacity Overview */}
        <Card className="bg-card border-border shadow-lg">
          <CardHeader className="py-4 border-b border-border/50">
            <CardTitle className="text-sm font-mono tracking-widest uppercase flex items-center gap-2">
              <ActivitySquare className="h-4 w-4 text-primary" />
              Stadium Occupancy
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center mb-6">
              <div className="text-5xl font-bold text-foreground font-mono tracking-tighter">
                {capacity?.currentOccupancy.toLocaleString() || "0"}
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
                / {capacity?.totalCapacity.toLocaleString() || "80,000"} FANS
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-muted-foreground">FILL RATE</span>
                <span className={cn(
                  capacity?.occupancyPercent && capacity.occupancyPercent > 90 ? "text-destructive" :
                  capacity?.occupancyPercent && capacity.occupancyPercent > 70 ? "text-warning" : "text-success"
                )}>
                  {capacity?.occupancyPercent?.toFixed(1) || 0}%
                </span>
              </div>
              <Progress 
                value={capacity?.occupancyPercent || 0} 
                className="h-2 bg-muted" 
                indicatorClassName={cn(
                  capacity?.occupancyPercent && capacity.occupancyPercent > 90 ? "bg-destructive" :
                  capacity?.occupancyPercent && capacity.occupancyPercent > 70 ? "bg-warning" : "bg-success"
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Gate Status */}
        <Card className="lg:col-span-2 bg-card border-border shadow-lg overflow-hidden flex flex-col">
          <CardHeader className="py-4 border-b border-border/50 shrink-0">
            <CardTitle className="text-sm font-mono tracking-widest uppercase flex items-center justify-between">
              <span>Gate Throughput</span>
            </CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {capacity?.gates.map(gate => (
                <div key={gate.id} className={cn(
                  "border rounded p-3 flex flex-col gap-2 transition-colors",
                  gate.status === 'closed' ? "bg-muted/10 border-border opacity-60" :
                  gate.status === 'congested' ? "bg-warning/5 border-warning/30" : "bg-card border-border"
                )}>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs uppercase tracking-wider">{gate.name}</span>
                    <Badge variant="outline" className={cn(
                      "text-[9px] uppercase font-mono rounded-sm border-none px-1 py-0 h-4",
                      gate.status === 'closed' ? "bg-muted text-muted-foreground" :
                      gate.status === 'congested' ? "bg-warning/20 text-warning animate-pulse-glow" : "bg-success/20 text-success"
                    )}>
                      {gate.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] text-muted-foreground uppercase">Flow</span>
                    <span className="font-mono text-sm">{gate.throughput}/min</span>
                  </div>
                </div>
              ))}
              {(!capacity?.gates || capacity.gates.length === 0) && (
                <div className="col-span-full h-20 flex items-center justify-center text-muted-foreground text-xs uppercase font-mono">
                  No gate data available
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>

      {/* Manual Demo Tools */}
      <Card className="bg-card border-border shadow-lg border-dashed">
        <CardHeader className="py-4 border-b border-border/50">
          <CardTitle className="text-sm font-mono tracking-widest uppercase flex items-center gap-2 text-muted-foreground">
            <QrCode className="h-4 w-4" />
            Manual Validator Simulator
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitTicket)} className="flex flex-col md:flex-row items-end gap-4">
              <FormField
                control={form.control}
                name="ticketId"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel className="text-[10px] uppercase font-mono text-muted-foreground">Ticket Hash</FormLabel>
                    <FormControl>
                      <Input placeholder="TK-0000" className="font-mono text-xs bg-background" {...field} />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="userId"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel className="text-[10px] uppercase font-mono text-muted-foreground">User ID</FormLabel>
                    <FormControl>
                      <Input placeholder="USR-0000" className="font-mono text-xs bg-background" {...field} />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={validateTicket.isPending} className="font-mono text-xs h-9 uppercase w-full md:w-auto">
                {validateTicket.isPending ? "Validating..." : "Validate"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

    </div>
  );
}

function MetricCard({ 
  title, 
  value, 
  icon: Icon,
  alert = false,
  critical = false,
  badge
}: { 
  title: string; 
  value: React.ReactNode; 
  icon: any;
  alert?: boolean;
  critical?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <Card className={cn(
      "bg-card border transition-all duration-300 shadow-md relative overflow-hidden",
      critical ? "border-destructive/50" : alert ? "border-warning/50" : "border-border"
    )}>
      {critical && <div className="absolute inset-0 bg-destructive/5 animate-pulse" />}
      {alert && !critical && <div className="absolute inset-0 bg-warning/5" />}
      <CardContent className="p-4 relative z-10 flex flex-col h-full">
        <div className="flex justify-between items-start mb-2">
          <span className="text-[10px] font-mono tracking-widest uppercase text-muted-foreground">{title}</span>
          <Icon className={cn(
            "h-4 w-4",
            critical ? "text-destructive" : alert ? "text-warning" : "text-primary/70"
          )} />
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-auto">
          <div className={cn(
            "text-2xl font-bold font-mono tracking-tight",
            critical ? "text-destructive" : alert ? "text-warning" : "text-foreground"
          )}>
            {value}
          </div>
          {badge}
        </div>
      </CardContent>
    </Card>
  );
}
