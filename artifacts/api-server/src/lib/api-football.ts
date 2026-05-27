import {
  getAllMatches,
  getUpcomingMatches as getUpcoming,
  getLiveMatches as getLive,
  getFinishedMatches,
  getMatchById,
  getStandings,
  getGroupStandings,
  tournament,
  type Match,
  type Group,
  type GroupTeam,
  type TournamentInfo,
} from './wc2026-data.js';

// Log initialization
console.error('[API Football] Using static WC 2026 data (no external API calls)');

// Get current fixtures/matches (World Cup)
export async function getWorldCupMatches(status?: 'live' | 'upcoming' | 'finished') {
  if (status === 'live') {
    return getLive();
  } else if (status === 'upcoming') {
    return getUpcoming();
  } else if (status === 'finished') {
    return getFinishedMatches();
  }
  return getAllMatches();
}

// Get standings/table (World Cup)
export async function getWorldCupStandings() {
  return getStandings();
}

// Get team information (World Cup team)
export async function getTeamInfo(teamId: number) {
  const allMatches = getAllMatches();
  const teamMatches = allMatches.matches.filter(
    m => m.homeTeam.id === teamId || m.awayTeam.id === teamId
  );
  const team = teamMatches[0]?.homeTeam.id === teamId ? teamMatches[0].homeTeam : teamMatches[0]?.awayTeam;
  return team || null;
}

// Get upcoming matches (next N matches, World Cup)
export async function getUpcomingMatches(limit: number = 10) {
  return getUpcoming(limit);
}

// Get live matches (World Cup)
export async function getLiveMatches() {
  return getLive();
}

// Get tournament info (World Cup)
export async function getTournamentInfo() {
  return tournament;
}

// Get match statistics (returns match details)
export async function getMatchStats(matchId: number) {
  return getMatchById(matchId);
}

// Get team statistics for a season (returns team info)
export async function getTeamStatsForSeason(teamId: number) {
  return getTeamInfo(teamId);
}

// Get head to head between two teams
export async function getHeadToHead(teamId1: number, teamId2: number) {
  const allMatches = getAllMatches();
  const h2hMatches = allMatches.matches.filter(
    m => (m.homeTeam.id === teamId1 && m.awayTeam.id === teamId2) ||
         (m.homeTeam.id === teamId2 && m.awayTeam.id === teamId1)
  );
  return { matches: h2hMatches };
}

// Get group standings with matches (new function for the group endpoint)
export async function getGroupStandingsWithMatches(name: string) {
  return getGroupStandings(name);
}

export default {
  getWorldCupMatches,
  getWorldCupStandings,
  getTeamInfo,
  getUpcomingMatches,
  getLiveMatches,
  getTournamentInfo,
  getMatchStats,
  getTeamStatsForSeason,
  getHeadToHead,
  getGroupStandingsWithMatches,
};
