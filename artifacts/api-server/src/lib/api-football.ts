const BASE_URL = 'https://v3.football.api-sports.io';
const API_KEY = process.env.API_FOOTBALL_KEY;

// Log API key status for debugging
console.error('[API Football] Initializing with key:', API_KEY ? 'SET' : 'NOT SET');

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
}

async function fetchFromAPIFootball(endpoint: string, options: FetchOptions = {}) {
  const url = `${BASE_URL}${endpoint}`;
  
  const headers = {
    'x-apisports-key': API_KEY || '',
    ...options.headers,
  };

  try {
    console.error(`[API Football] Fetching ${url}`);
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
    });

    console.error(`[API Football] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API Football] Error response: ${errorText}`);
      throw new Error(`API Football API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.error(`[API Football] Success: received data`);
    return data;
  } catch (error) {
    console.error(`[API Football] Error fetching from ${endpoint}:`, error);
    throw error;
  }
}

// Get current fixtures/matches (using Premier League as demo since World Cup 2026 not available in free tier)
export async function getWorldCupMatches(status?: 'live' | 'upcoming' | 'finished') {
  const leagueId = 39; // English Premier League (has live data)
  const season = 2024;
  
  let endpoint = `/fixtures?league=${leagueId}&season=${season}`;
  if (status) {
    endpoint += `&status=${status}`;
  }
  
  return fetchFromAPIFootball(endpoint);
}

// Get standings/table
export async function getWorldCupStandings() {
  const leagueId = 39; // English Premier League
  const season = 2024;
  
  return fetchFromAPIFootball(`/standings?league=${leagueId}&season=${season}`);
}

// Get team information
export async function getTeamInfo(teamId: number) {
  return fetchFromAPIFootball(`/teams?id=${teamId}`);
}

// Get upcoming matches (next N matches)
export async function getUpcomingMatches(limit: number = 10) {
  const leagueId = 39;
  const season = 2024;
  
  const response = await fetchFromAPIFootball(
    `/fixtures?league=${leagueId}&season=${season}&status=upcoming`
  );
  
  // Return only the requested number of matches
  if (response?.response) {
    return {
      ...response,
      response: response.response.slice(0, limit),
    };
  }
  
  return response;
}

// Get live matches
export async function getLiveMatches() {
  return fetchFromAPIFootball(`/fixtures?status=live&timezone=UTC`);
}

// Get tournament info
export async function getTournamentInfo() {
  const leagueId = 39;
  const season = 2024;
  
  return fetchFromAPIFootball(`/leagues?id=${leagueId}&season=${season}`);
}

// Get match statistics
export async function getMatchStats(fixtureId: number) {
  return fetchFromAPIFootball(`/fixtures/statistics?fixture=${fixtureId}`);
}

// Get team statistics for a season
export async function getTeamStatsForSeason(teamId: number, leagueId: number = 1, season: number = 2026) {
  return fetchFromAPIFootball(`/teams/statistics?team=${teamId}&league=${leagueId}&season=${season}`);
}

// Get head to head between two teams
export async function getHeadToHead(teamId1: number, teamId2: number) {
  return fetchFromAPIFootball(`/fixtures/headtohead?h2h=${teamId1}-${teamId2}`);
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
};
