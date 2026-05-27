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
  fixture: {
    id: number;
    date: string;
    status: string;
  };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
}

interface TeamStanding {
  rank: number;
  team: { id: number; name: string; logo: string };
  points: number;
  goalsDiff: number;
  goals: { for: number; against: number };
}

interface TournamentInfo {
  league: {
    id: number;
    name: string;
    logo: string;
    season: number;
  };
}

export default function Dashboard() {
  const { toast } = useToast();
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [tournamentInfo, setTournamentInfo] = useState<TournamentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWorldCupData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch upcoming matches
        const upcomingRes = await fetch(`${API_BASE}/api/fifa/worldcup/upcoming`);
        if (upcomingRes.ok) {
          const upcomingData = await upcomingRes.json();
          setUpcomingMatches(upcomingData.response || []);
        }

        // Fetch live matches
        const liveRes = await fetch(`${API_BASE}/api/fifa/worldcup/live`);
        if (liveRes.ok) {
          const liveData = await liveRes.json();
          setLiveMatches(liveData.response || []);
        }

        // Fetch standings
        const standingsRes = await fetch(`${API_BASE}/api/fifa/worldcup/standings`);
        if (standingsRes.ok) {
          const standingsData = await standingsRes.json();
          const allStandings: TeamStanding[] = [];
          if (standingsData.response && Array.isArray(standingsData.response)) {
            standingsData.response.forEach((group: any) => {
              if (group.standings && Array.isArray(group.standings[0])) {
                allStandings.push(...group.standings[0]);
              }
            });
          }
          setStandings(allStandings.slice(0, 8));
        }

        // Fetch tournament info
        const tournamentRes = await fetch(`${API_BASE}/api/fifa/worldcup/tournament`);
        if (tournamentRes.ok) {
          const tournamentData = await tournamentRes.json();
          if (tournamentData.response && tournamentData.response[0]) {
            setTournamentInfo(tournamentData.response[0]);
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
    // Refresh data every 30 seconds
    const interval = setInterval(fetchWorldCupData, 30000);
    return () => clearInterval(interval);
  }, [toast]);

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
                  <div key={match.fixture.id} className="flex items-center justify-between p-4 rounded-lg bg-card border border-border/50">
                    <div className="text-sm font-semibold text-primary">{match.teams.home.name}</div>
                    <div className="text-2xl font-black text-foreground">
                      {match.goals.home ?? '-'} - {match.goals.away ?? '-'}
                    </div>
                    <div className="text-sm font-semibold text-primary">{match.teams.away.name}</div>
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
                  <div key={match.fixture.id} className="p-4 rounded-lg bg-secondary/20 border border-secondary/50 hover:border-primary/50 transition-colors">
                    <div className="text-xs text-muted-foreground mb-2">
                      {new Date(match.fixture.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">{match.teams.home.name}</div>
                      <div className="text-xs text-muted-foreground">vs</div>
                      <div className="text-sm font-semibold">{match.teams.away.name}</div>
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
                        <span className="text-sm font-bold text-primary w-6">{team.rank}</span>
                        <div className="flex items-center gap-2">
                          {team.team.logo && (
                            <img src={team.team.logo} alt={team.team.name} className="h-6 w-6 rounded-full" />
                          )}
                          <span className="text-sm font-semibold">{team.team.name}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-muted-foreground">G: {team.goals.for}-{team.goals.against}</span>
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
            <p>No match data available yet. Please ensure your API_FOOTBALL_KEY is configured correctly.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
