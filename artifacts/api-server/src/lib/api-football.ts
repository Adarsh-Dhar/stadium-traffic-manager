const BASE_URL = 'https://api.football-data.org/v4';
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;

// Log API key status for debugging
console.error('[API Football] Initializing with key:', API_KEY ? 'SET' : 'NOT SET');


interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
}

async function fetchFromFootballData(endpoint: string, options: FetchOptions = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'X-Auth-Token': API_KEY || '',
    'Cache-Control': 'no-cache',
    ...options.headers,
  };
  try {
    console.error(`[Football Data] Fetching ${url}`);
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
    });
    console.error(`[Football Data] Response status: ${response.status}`);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Football Data] Error response: ${errorText}`);
      throw new Error(`Football Data API error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    console.error(`[Football Data] Success: received data`);
    return data;
  } catch (error) {
    console.error(`[Football Data] Error fetching from ${endpoint}:`, error);
    throw error;
  }
}

// Get current fixtures/matches (World Cup)
export async function getWorldCupMatches(status?: 'live' | 'upcoming' | 'finished') {
  // football-data.org: /competitions/WC/matches?status=SCHEDULED|LIVE|FINISHED
  let endpoint = `/competitions/WC/matches`;
  if (status) {
    // Map to football-data.org status
    let mappedStatus = status === 'upcoming' ? 'SCHEDULED' : status.toUpperCase();
    endpoint += `?status=${mappedStatus}`;
  }
  return fetchFromFootballData(endpoint);
}

// Get standings/table (World Cup)
export async function getWorldCupStandings() {
  // football-data.org: /competitions/WC/standings
  return fetchFromFootballData(`/competitions/WC/standings`);
}

// Get team information (World Cup team)
export async function getTeamInfo(teamId: number) {
  // football-data.org: /teams/{id}
  return fetchFromFootballData(`/teams/${teamId}`);
}

// Get upcoming matches (next N matches, World Cup)
export async function getUpcomingMatches(limit: number = 10) {
  // football-data.org: /competitions/WC/matches?status=SCHEDULED
  const response = await fetchFromFootballData(`/competitions/WC/matches?status=SCHEDULED`);
  if (response?.matches) {
    return {
      ...response,
      matches: response.matches.slice(0, limit),
    };
  }
  return response;
}

// Get live matches (World Cup)
export async function getLiveMatches() {
  // football-data.org: /competitions/WC/matches?status=LIVE
  return fetchFromFootballData(`/competitions/WC/matches?status=LIVE`);
}

// Get tournament info (World Cup)
export async function getTournamentInfo() {
  // football-data.org: /competitions/WC
  return fetchFromFootballData(`/competitions/WC`);
}

// Get match statistics (not directly available in football-data.org for WC, fallback to match details)
export async function getMatchStats(matchId: number) {
  // football-data.org: /matches/{id}
  return fetchFromFootballData(`/matches/${matchId}`);
}

// Get team statistics for a season (not directly available in football-data.org, fallback to team info)
export async function getTeamStatsForSeason(teamId: number) {
  return fetchFromFootballData(`/teams/${teamId}`);
}

// Get head to head between two teams (not directly available in football-data.org, fallback to matches between teams)
export async function getHeadToHead(teamId1: number, teamId2: number) {
  // football-data.org: /competitions/WC/matches?status=FINISHED&teamIds=teamId1,teamId2 (not a real param, but for demo)
  return fetchFromFootballData(`/competitions/WC/matches?status=FINISHED`);
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
