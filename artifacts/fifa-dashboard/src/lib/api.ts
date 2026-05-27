// Typed fetch client for FIFA World Cup API

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface Match {
  id: number;
  homeTeam: { id: number; name: string; crest: string };
  awayTeam: { id: number; name: string; crest: string };
  utcDate: string;
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED';
  stage: string;
  group?: string;
  score: {
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
    winner: string | null;
  };
  venue: string;
}

export interface GroupTeam {
  position: number;
  team: { id: number; name: string; crest: string };
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
}

export interface Group {
  name: string;
  table: GroupTeam[];
}

export interface TournamentInfo {
  id: number;
  name: string;
  emblem: string;
  area: { name: string };
  currentSeason: {
    startDate: string;
    endDate: string;
    currentMatchday: number;
  };
}

export interface Venue {
  id: number;
  name: string;
  city: string;
  country: string;
  capacity: number;
}

export interface MetricsResponse {
  latency: number;
  requestsPerSecond: number;
  cpuUsage: number;
  errorRate: number;
  activeServers: number;
  queueLength: number;
  memoryUsage: number;
  throughput: number;
}

class ApiClient {
  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${API_BASE}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async tournament(): Promise<TournamentInfo> {
    return this.fetch<TournamentInfo>('/fifa/worldcup/tournament');
  }

  async matches(status?: 'live' | 'upcoming' | 'finished'): Promise<{ matches: Match[] }> {
    const query = status ? `?status=${status}` : '';
    return this.fetch<{ matches: Match[] }>(`/fifa/worldcup/matches${query}`);
  }

  async upcoming(limit: number = 10): Promise<{ matches: Match[] }> {
    return this.fetch<{ matches: Match[] }>(`/fifa/worldcup/upcoming?limit=${limit}`);
  }

  async live(): Promise<{ matches: Match[] }> {
    return this.fetch<{ matches: Match[] }>('/fifa/worldcup/live');
  }

  async standings(): Promise<{ standings: Group[] }> {
    return this.fetch<{ standings: Group[] }>('/fifa/worldcup/standings');
  }

  async group(name: string): Promise<{ group: Group; matches: Match[] }> {
    return this.fetch<{ group: Group; matches: Match[] }>(`/fifa/worldcup/group/${name}`);
  }

  async bracket(): Promise<{ matches: Match[] }> {
    return this.fetch<{ matches: Match[] }>('/fifa/worldcup/bracket');
  }

  async match(id: number): Promise<Match> {
    return this.fetch<Match>(`/fifa/worldcup/match/${id}/stats`);
  }

  async metrics(): Promise<MetricsResponse> {
    return this.fetch<MetricsResponse>('/metrics/current');
  }

  async metricsHistory(): Promise<{ history: MetricsResponse[] }> {
    return this.fetch<{ history: MetricsResponse[] }>('/metrics/history');
  }

  async alerts(): Promise<{ alerts: any[] }> {
    return this.fetch<{ alerts: any[] }>('/metrics/alerts');
  }
}

export const api = new ApiClient();
