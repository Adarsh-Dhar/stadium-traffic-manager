import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Zap, Users, TrendingUp, Target, Clock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const API_BASE = "http://localhost:5000";
interface Match {
  id: number;
  utcDate: string;
  status: string;
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
  score: {
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
    winner: string | null;
  };
}

interface TeamStanding {
  position: number;
  team: { id: number; name: string; crest: string };
  points: number;
  goalsFor: number;
  goalsAgainst: number;
}

interface TournamentInfo {
  id: number;
  name: string;
  emblem: string;
  area: { name: string };
  currentSeason?: { startDate: string; endDate: string; currentMatchday?: number };
}

export default function Dashboard() {
  const { toast } = useToast();
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [tournamentInfo, setTournamentInfo] = useState<TournamentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // System health + AI analyze state
  const [systemHealth, setSystemHealth] = useState<{
    mcp?: any | null;
    metrics?: any | null;
  } | null>(null);
  const [aiResult, setAiResult] = useState<any | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    const fetchWorldCupData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch upcoming matches
        const upcomingRes = await fetch(`${API_BASE}/api/fifa/worldcup/upcoming`);
        if (upcomingRes.ok) {
          const upcomingData = await upcomingRes.json();
          setUpcomingMatches(upcomingData.matches || []);
        }

        // Fetch live matches
        const liveRes = await fetch(`${API_BASE}/api/fifa/worldcup/live`);
        if (liveRes.ok) {
          const liveData = await liveRes.json();
          setLiveMatches(liveData.matches || []);
        }

        // Fetch standings
        const standingsRes = await fetch(`${API_BASE}/api/fifa/worldcup/standings`);
        if (standingsRes.ok) {
          const standingsData = await standingsRes.json();
          let allStandings: TeamStanding[] = [];
          if (standingsData.standings && Array.isArray(standingsData.standings)) {
            // Use the first group (usually 'TOTAL' or 'GROUP A')
            const group = standingsData.standings[0];
            if (group && Array.isArray(group.table)) {
              allStandings = group.table.map((entry: any) => ({
                position: entry.position,
                team: { id: entry.team.id, name: entry.team.name, crest: entry.team.crest },
                points: entry.points,
                goalsFor: entry.goalsFor,
                goalsAgainst: entry.goalsAgainst,
              }));

                setStandings(allStandings);
              }
            }

          }

          // Fetch tournament info
        const tournamentRes = await fetch(`${API_BASE}/api/fifa/worldcup/tournament`);
        if (tournamentRes.ok) {
          const tournamentData = await tournamentRes.json();
          if (tournamentData && tournamentData.id) {
            setTournamentInfo(tournamentData);
          }
        }
      } catch (err) {
        console.error("Error fetching World Cup data:", err);
        setError("Failed to load World Cup data");
        toast({
          title: "Error",
          description: "Failed to fetch World Cup data. Please check your API key.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchWorldCupData();
    // Fetch system health on mount + poll
    const fetchHealth = async () => {
      try {
        const [mcpRes, metricsRes] = await Promise.all([
          fetch(`${API_BASE}/api/metrics/mcp-status`),
          fetch(`${API_BASE}/api/metrics/current`),
        ]);
        const mcp = mcpRes.ok ? await mcpRes.json() : null;
        const metrics = metricsRes.ok ? await metricsRes.json() : null;
        setSystemHealth({ mcp, metrics });
      } catch (err) {
        console.error("Failed to fetch system health", err);
      }
    };

    fetchHealth();
    const healthInterval = setInterval(fetchHealth, 5000);
    // Refresh data every 30 seconds
    const interval = setInterval(fetchWorldCupData, 30000);
    return () => {
      clearInterval(interval);
      clearInterval(healthInterval);
    };
  }, [toast]);

  const handleAiAnalyze = async () => {
    setAiLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/ai-analyze`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "unknown" }));
        toast({ title: "AI Analyze failed", description: err.error || "Unknown error", variant: "destructive" });
        setAiLoading(false);
        return;
      }
      const data = await res.json();
      setAiResult(data);
      toast({ title: "AI Analysis Complete", description: data.analysis?.slice(0, 120) ?? "Analysis ready" });
      // refresh system health/metrics after action
      const metricsRes = await fetch(`${API_BASE}/api/metrics/current`);
      const mcpRes = await fetch(`${API_BASE}/api/metrics/mcp-status`);
      setSystemHealth({ metrics: metricsRes.ok ? await metricsRes.json() : null, mcp: mcpRes.ok ? await mcpRes.json() : null });
    } catch (err) {
      console.error(err);
      toast({ title: "AI Analyze error", description: "Failed to run AI analysis", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

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
        {/* System Health + AI Panel */}
        <div className="relative z-10 mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>System Health</CardTitle>
              <CardDescription>Live system metrics and MCP status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">CPU</div>
                  <div className="font-bold">{systemHealth?.metrics?.cpuUsage ?? "—"}%</div>
                </div>
                <Progress value={systemHealth?.metrics?.cpuUsage ?? 0} />

                <div className="flex items-center justify-between mt-2">
                  <div className="text-sm text-muted-foreground">Avg Latency</div>
                  <div className="font-bold">{systemHealth?.metrics?.avgLatency ?? "—"}ms</div>
                </div>

                <div className="flex items-center justify-between mt-2">
                  <div className="text-sm text-muted-foreground">Active Servers</div>
                  <div className="font-bold">{systemHealth?.metrics?.activeServers ?? "—"}</div>
                </div>

                <div className="flex items-center justify-between mt-2">
                  <div className="text-sm text-muted-foreground">RPS</div>
                  <div className="font-bold">{systemHealth?.metrics?.requestsPerSecond ?? "—"}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI Analysis</CardTitle>
              <CardDescription>Run the SRE assistant to analyze current metrics and auto-heal</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Button onClick={handleAiAnalyze} disabled={aiLoading}>
                  <Zap className="h-4 w-4" />
                  {aiLoading ? "Analyzing…" : "Analyze with AI"}
                </Button>
                <Badge>{aiResult ? (aiResult.serversAdded > 0 ? "Scaled" : "Analyzed") : "Idle"}</Badge>
              </div>

              {aiResult && (
                <div className="mt-4 text-sm">
                  <div className="font-semibold mb-1">Summary</div>
                  <div className="text-muted-foreground mb-2">{aiResult.analysis}</div>
                  <div className="font-semibold mb-1">Actions</div>
                  <ul className="list-disc ml-5 text-sm mb-2">
                    {aiResult.actions?.map((a: string, i: number) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                  <div className="text-xs text-muted-foreground">Confidence: {(aiResult.confidence ?? 0).toFixed(2)}</div>
                  {aiResult.serversAdded > 0 && (
                    <div className="mt-2 text-sm text-green-600">Added {aiResult.serversAdded} server(s)</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>MCP Status</CardTitle>
              <CardDescription>Dynatrace MCP / bridge status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">{systemHealth?.mcp?.status ?? "No MCP"}</div>
              <div className="mt-2 text-xs text-muted-foreground">{systemHealth?.mcp?.dynatraceEnvId ? `Env: ${systemHealth.mcp.dynatraceEnvId}` : systemHealth?.mcp?.serverUrl ?? "Not configured"}</div>
              <div className="mt-2 text-xs">Tools: {systemHealth?.mcp?.toolsAvailable?.join(", ") ?? "—"}</div>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Live Matches Section */}
      {liveMatches.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <Card className="border-primary/50 bg-card/50 hover:bg-card/80 transition-colors">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse"></div>
                <CardTitle>LIVE MATCHES</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {liveMatches.map((match) => (
                  <div key={match.id} className="flex items-center justify-between p-4 rounded-lg bg-card border border-border/50">
                    <div className="text-sm font-semibold text-primary">{match.homeTeam.name}</div>
                    <div className="text-2xl font-black text-foreground">
                      {(match.score.fullTime.home ?? '-')} - {(match.score.fullTime.away ?? '-')}
                    </div>
                    <div className="text-sm font-semibold text-primary">{match.awayTeam.name}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Loading World Cup data...</span>
        </div>
      )}

      {/* Upcoming Matches Section */}
      {!loading && upcomingMatches.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <Card className="border-border/50 bg-card/50 hover:bg-card/80 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-accent" />
                UPCOMING MATCHES
              </CardTitle>
              <CardDescription>Next fixtures in the tournament</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcomingMatches.slice(0, 6).map((match) => (
                  <div key={match.id} className="p-4 rounded-lg bg-secondary/20 border border-secondary/50 hover:border-primary/50 transition-colors">
                    <div className="text-xs text-muted-foreground mb-2">
                      {new Date(match.utcDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">{match.homeTeam.name}</div>
                      <div className="text-xs text-muted-foreground">vs</div>
                      <div className="text-sm font-semibold">{match.awayTeam.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Tournament Standings */}
      {!loading && standings.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                TOURNAMENT STANDINGS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="w-full">
                <div className="space-y-2">
                  {standings.map((team, idx) => (
                    <div key={team.team.id} className="flex items-center justify-between p-3 rounded-lg bg-card/50 hover:bg-card/80 transition-colors border border-border/30">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-primary w-6">{team.position}</span>
                        <div className="flex items-center gap-2">
                          {team.team.crest && (
                            <img src={team.team.crest} alt={team.team.name} className="h-6 w-6 rounded-full" />
                          )}
                          <span className="text-sm font-semibold">{team.team.name}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-muted-foreground">G: {team.goalsFor}-{team.goalsAgainst}</span>
                        <span className="font-bold text-primary">{team.points} pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-500">
              <AlertCircle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Data Message */}
      {!loading && upcomingMatches.length === 0 && !error && (
        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-6 text-center text-muted-foreground">
            <p>No match data available yet. Please ensure your Football Data API key is configured correctly and matches are scheduled.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
