import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Trophy, MapPin, Calendar, Users, Flag, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api, type Match, type Group, type Venue } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function WorldCup() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [bracket, setBracket] = useState<Match[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>("All");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [standingsData, matchesData, bracketData] = await Promise.all([
          api.standings(),
          api.matches(),
          api.bracket(),
        ]);
        setGroups(standingsData.standings);
        setMatches(matchesData.matches);
        setBracket(bracketData.matches);
        
        // Mock venues data (since it's not in the API yet)
        setVenues([
          { id: 1, name: "MetLife Stadium", city: "East Rutherford", country: "USA", capacity: 82500 },
          { id: 2, name: "AT&T Stadium", city: "Arlington", country: "USA", capacity: 80000 },
          { id: 3, name: "SoFi Stadium", city: "Inglewood", country: "USA", capacity: 70000 },
          { id: 4, name: "Lumen Field", city: "Seattle", country: "USA", capacity: 68000 },
          { id: 5, name: "Arrowhead Stadium", city: "Kansas City", country: "USA", capacity: 76000 },
          { id: 6, name: "Hard Rock Stadium", city: "Miami Gardens", country: "USA", capacity: 65000 },
          { id: 7, name: "NRG Stadium", city: "Houston", country: "USA", capacity: 72000 },
          { id: 8, name: "Lincoln Financial Field", city: "Philadelphia", country: "USA", capacity: 69000 },
          { id: 9, name: "Levi's Stadium", city: "Santa Clara", country: "USA", capacity: 68000 },
          { id: 10, name: "Bank of America Stadium", city: "Charlotte", country: "USA", capacity: 75000 },
          { id: 11, name: "Estadio Azteca", city: "Mexico City", country: "Mexico", capacity: 87000 },
          { id: 12, name: "Estadio BBVA", city: "Monterrey", country: "Mexico", capacity: 51000 },
          { id: 13, name: "Estadio Akron", city: "Guadalajara", country: "Mexico", capacity: 46000 },
          { id: 14, name: "BMO Field", city: "Toronto", country: "Canada", capacity: 45000 },
          { id: 15, name: "BC Place", city: "Vancouver", country: "Canada", capacity: 54000 },
          { id: 16, name: "Commonwealth Stadium", city: "Edmonton", country: "Canada", capacity: 56000 },
        ]);
      } catch (error) {
        console.error("Error fetching World Cup data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filteredMatches = selectedGroup === "All" 
    ? matches.filter(m => m.stage === "GROUP_STAGE")
    : matches.filter(m => m.group === selectedGroup);

  const groupOptions = ["All", ...groups.map(g => g.name)];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1600px] mx-auto pb-10">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-lg border border-border bg-gradient-to-br from-primary/20 via-card to-secondary/20 p-8"
      >
        <div className="relative z-10 flex items-center gap-4">
          <div className="text-6xl">🏆</div>
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-primary">FIFA WORLD CUP 2026</h1>
            <p className="text-sm text-muted-foreground mt-2 uppercase tracking-wider">Canada • Mexico • USA</p>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <Tabs defaultValue="groups" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="groups">Groups</TabsTrigger>
          <TabsTrigger value="matches">Matches</TabsTrigger>
          <TabsTrigger value="bracket">Bracket</TabsTrigger>
          <TabsTrigger value="venues">Venues</TabsTrigger>
        </TabsList>

        {/* Groups Tab */}
        <TabsContent value="groups" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {groups.map((group) => (
              <GroupTable key={group.name} group={group} />
            ))}
          </div>
        </TabsContent>

        {/* Matches Tab */}
        <TabsContent value="matches" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Group Stage Matches</span>
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="bg-secondary border border-border rounded px-3 py-1 text-sm"
                >
                  {groupOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt === "All" ? "All Groups" : `Group ${opt}`}</option>
                  ))}
                </select>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <div className="space-y-2">
                  {filteredMatches.map((match) => (
                    <MatchRow key={match.id} match={match} />
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bracket Tab */}
        <TabsContent value="bracket" className="mt-6">
          <div className="space-y-6">
            {["ROUND_OF_32", "ROUND_OF_16", "QUARTER_FINAL", "SEMI_FINAL", "THIRD_PLACE", "FINAL"].map((stage) => {
              const stageMatches = bracket.filter(m => m.stage === stage);
              if (stageMatches.length === 0) return null;
              return (
                <Card key={stage}>
                  <CardHeader>
                    <CardTitle className="capitalize">{stage.replace(/_/g, ' ')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {stageMatches.map((match) => (
                        <MatchRow key={match.id} match={match} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Venues Tab */}
        <TabsContent value="venues" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {venues.map((venue) => (
              <VenueCard key={venue.id} venue={venue} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GroupTable({ group }: { group: Group }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center">Group {group.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {group.table.map((team) => (
            <div key={team.team.id} className="flex items-center justify-between p-2 rounded bg-secondary/20">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-primary w-6">{team.position}</span>
                {team.team.crest && (
                  <img src={team.team.crest} alt={team.team.name} className="h-5 w-5 rounded-full" />
                )}
                <span className="text-sm font-medium">{team.team.name}</span>
              </div>
              <span className="text-sm font-bold text-primary">{team.points} pts</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MatchRow({ match }: { match: Match }) {
  const isLive = match.status === 'LIVE';
  const isFinished = match.status === 'FINISHED';
  
  return (
    <div className={cn(
      "flex items-center justify-between p-3 rounded-lg border transition-colors",
      isLive ? "bg-red-500/10 border-red-500/50" : "bg-card/50 border-border/50 hover:border-primary/50"
    )}>
      <div className="flex items-center gap-3 flex-1">
        {match.homeTeam.crest && (
          <img src={match.homeTeam.crest} alt={match.homeTeam.name} className="h-6 w-6 rounded-full" />
        )}
        <span className="text-sm font-semibold">{match.homeTeam.name}</span>
      </div>
      
      <div className="flex items-center gap-4 px-4">
        {isLive && (
          <Badge variant="destructive" className="animate-pulse">LIVE</Badge>
        )}
        <div className="text-lg font-black">
          {isFinished ? `${match.score.fullTime.home} - ${match.score.fullTime.away}` : 'vs'}
        </div>
        {isFinished && match.score.winner && (
          <Badge variant={match.score.winner === 'HOME' ? 'default' : 'secondary'}>
            {match.score.winner === 'HOME' ? match.homeTeam.name : match.awayTeam.name} won
          </Badge>
        )}
      </div>
      
      <div className="flex items-center gap-3 flex-1 justify-end">
        <span className="text-sm font-semibold">{match.awayTeam.name}</span>
        {match.awayTeam.crest && (
          <img src={match.awayTeam.crest} alt={match.awayTeam.name} className="h-6 w-6 rounded-full" />
        )}
      </div>
    </div>
  );
}

function VenueCard({ venue }: { venue: Venue }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{venue.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>{venue.city}, {venue.country}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{venue.capacity.toLocaleString()} seats</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
