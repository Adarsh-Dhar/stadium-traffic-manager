// Static dataset for FIFA World Cup 2026 (generated fixture)
// Exports helper functions used by the API layer to serve matches and standings

export type Team = { id: number; name: string; crest?: string };

export type Match = {
  id: number;
  homeTeam: Team;
  awayTeam: Team;
  utcDate: string;
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED';
  stage:
    | 'GROUP_STAGE'
    | 'ROUND_OF_32'
    | 'ROUND_OF_16'
    | 'QUARTER_FINAL'
    | 'SEMI_FINAL'
    | 'THIRD_PLACE'
    | 'FINAL';
  group?: string;
  score: {
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
    winner: 'HOME' | 'AWAY' | 'DRAW' | null;
  };
  venue: string;
};

export type GroupTeam = {
  position: number;
  team: Team;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
};

export type Group = {
  name: string;
  table: GroupTeam[];
};

export type TournamentInfo = {
  id: number;
  name: string;
  emblem: string;
  area: { name: string };
  currentSeason: { startDate: string; endDate: string; currentMatchday: number };
};

// Teams (48 teams arranged by group A-L as provided)
const TEAM_NAMES = [
  // Group A
  'Mexico', 'South Africa', 'Korea Republic', 'Czechia',
  // Group B
  'Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland',
  // Group C
  'Brazil', 'Morocco', 'Haiti', 'Scotland',
  // Group D
  'USA', 'Paraguay', 'Australia', 'Türkiye',
  // Group E
  'Germany', 'Curaçao', 'Côte d\'Ivoire', 'Ecuador',
  // Group F
  'Netherlands', 'Japan', 'Sweden', 'Tunisia',
  // Group G
  'Belgium', 'Egypt', 'IR Iran', 'New Zealand',
  // Group H
  'Spain', 'Cabo Verde', 'Saudi Arabia', 'Uruguay',
  // Group I
  'France', 'Senegal', 'Iraq', 'Norway',
  // Group J
  'Argentina', 'Algeria', 'Austria', 'Jordan',
  // Group K
  'Portugal', 'Congo DR', 'Uzbekistan', 'Colombia',
  // Group L
  'England', 'Croatia', 'Ghana', 'Panama',
];

const teams: Team[] = TEAM_NAMES.map((name, idx) => ({ id: idx + 1, name, crest: '' }));

const GROUP_NAMES = 'ABCDEFGHIJKL'.split('');

const groups: Group[] = GROUP_NAMES.map((g, gi) => {
  const start = gi * 4;
  const table: GroupTeam[] = [];
  for (let i = 0; i < 4; i++) {
    const t = teams[start + i];
    table.push({
      position: i + 1,
      team: t,
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
    });
  }
  return { name: g, table };
});

export const venues = [
  { id: 1, name: 'MetLife Stadium', city: 'East Rutherford', country: 'USA', capacity: 82500 },
  { id: 2, name: 'AT&T Stadium', city: 'Arlington', country: 'USA', capacity: 80000 },
  { id: 3, name: 'SoFi Stadium', city: 'Inglewood', country: 'USA', capacity: 70000 },
  { id: 4, name: 'Lumen Field', city: 'Seattle', country: 'USA', capacity: 68000 },
  { id: 5, name: 'Arrowhead Stadium', city: 'Kansas City', country: 'USA', capacity: 76000 },
  { id: 6, name: 'Hard Rock Stadium', city: 'Miami Gardens', country: 'USA', capacity: 65000 },
  { id: 7, name: 'NRG Stadium', city: 'Houston', country: 'USA', capacity: 72000 },
  { id: 8, name: 'Lincoln Financial Field', city: 'Philadelphia', country: 'USA', capacity: 69000 },
  { id: 9, name: "Levi's Stadium", city: 'Santa Clara', country: 'USA', capacity: 68000 },
  { id: 10, name: 'Bank of America Stadium', city: 'Charlotte', country: 'USA', capacity: 75000 },
  { id: 11, name: 'Estadio Azteca', city: 'Mexico City', country: 'Mexico', capacity: 87000 },
  { id: 12, name: 'Estadio BBVA', city: 'Monterrey', country: 'Mexico', capacity: 51000 },
  { id: 13, name: 'Estadio Akron', city: 'Guadalajara', country: 'Mexico', capacity: 46000 },
  { id: 14, name: 'BMO Field', city: 'Toronto', country: 'Canada', capacity: 45000 },
  { id: 15, name: 'BC Place', city: 'Vancouver', country: 'Canada', capacity: 54000 },
  { id: 16, name: 'Commonwealth Stadium', city: 'Edmonton', country: 'Canada', capacity: 56000 },
];

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function computeMatchStatus(utcDate: string): 'SCHEDULED' | 'LIVE' | 'FINISHED' {
  const start = new Date(utcDate).getTime();
  const now = Date.now();
  const finishedThreshold = start + 1000 * 60 * 120; // 120 minutes
  if (now >= start && now < finishedThreshold) return 'LIVE';
  if (now >= finishedThreshold) return 'FINISHED';
  return 'SCHEDULED';
}
// Parse user-provided raw schedule (IST) and convert to structured matches
import { RAW_SCHEDULE, RawScheduleMatch } from './wc2026-schedule';

// Helper: map of known teams -> Team objects
const teamMap = new Map<string, Team>();
for (const t of teams) teamMap.set(t.name.toLowerCase(), t);
let nextTeamId = teams.length + 1;
// Global incremental match id for generated matches
let matchId = 1;

function getOrCreateTeam(name: string): Team {
  const key = name.trim().toLowerCase();
  if (teamMap.has(key)) return teamMap.get(key)!;
  const t: Team = { id: nextTeamId++, name: name.trim(), crest: '' };
  teams.push(t);
  teamMap.set(key, t);
  return t;
}

function monthNameToIndex(m: string) {
  const map: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  };
  return map[m.toLowerCase()] ?? -1;
}

function parseDateHeader(line: string): { year: number; month: number; day: number } | null {
  // matches 'Friday 12 June 2026' or '12 June 2026'
  const m = line.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = monthNameToIndex(m[2]);
  const year = parseInt(m[3], 10);
  if (month < 0) return null;
  return { year, month, day };
}

function parseTimeString(timeRaw: string) {
  // accepts '00:30', '08:30 PM', '6:30', '06:30'
  const m = timeRaw.trim().match(/(\d{1,2}):(\d{2})(?:\s*([APMapm]{2}))?/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const ampm = m[3];
  if (ampm) {
    const a = ampm.toUpperCase();
    if (a === 'PM' && hour < 12) hour += 12;
    if (a === 'AM' && hour === 12) hour = 0;
  }
  return { hour, minute };
}

function istDateTimeToUTCISO(y: number, m: number, d: number, hour: number, minute: number) {
  // Provided components are IST (UTC+5:30). Convert to UTC milliseconds.
  const istMs = Date.UTC(y, m, d, hour, minute);
  const utcMs = istMs - (5 * 60 + 30) * 60 * 1000;
  return new Date(utcMs).toISOString();
}

function parseRawSchedule(raw: string): RawScheduleMatch[] {
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const entries: RawScheduleMatch[] = [];
  let currentDateHeader: string | null = null;
  let currentDateObj: { year: number; month: number; day: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const dateObj = parseDateHeader(line);
    if (dateObj) {
      currentDateHeader = line;
      currentDateObj = dateObj;
      continue;
    }

    // detect time lines
    const timeMatch = line.match(/^(\d{1,2}:\d{2})(?:\s*[APMapm]{2})?$/) || line.match(/^(\d{1,2}:\d{2})\s*([APMapm]{2})$/);
    if (timeMatch && currentDateObj) {
      // find home (previous non-empty non-meta line)
      let home = '';
      for (let j = i - 1; j >= 0; j--) {
        const l = lines[j];
        if (!l) continue;
        if (/First Stage|Group\s?[A-L]|Round of|Round of 32|Quarter-final|Semi-final|Play-off/i.test(l)) continue;
        if (/Stadium|\(|\)|·/.test(l)) continue;
        if (parseDateHeader(l)) break; // hit another date
        home = l;
        break;
      }

      // find away (next non-empty non-meta line)
      let away = '';
      let group: string | undefined = undefined;
      let venue: string | undefined = undefined;
      let city: string | undefined = undefined;
      let stage: string | undefined = undefined;
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        if (!l) continue;
        if (!away) {
          if (/First Stage|Group\s?[A-L]|Round of|Round of 32|Quarter-final|Semi-final|Play-off/i.test(l)) continue;
          if (/Stadium|\(|\)|·/.test(l)) {
            // if stadium appears before an away team, skip
            continue;
          }
          if (parseDateHeader(l)) break;
          away = l;
          continue;
        }
        // after away, collect meta info
        if (/Group\s*[A-L]/i.test(l)) {
          const mg = l.match(/Group\s*([A-L])/i);
          if (mg) group = mg[1].toUpperCase();
          continue;
        }
        if (/Round of|Quarter-final|Semi-final|Play-off|Final|First Stage/i.test(l)) {
          stage = l;
          continue;
        }
        if (/Stadium/i.test(l) || /stadium/i.test(l)) {
          venue = l.replace(/·/g, '').trim();
          // look ahead for city in parentheses
          const next = lines[j + 1] ?? '';
          if (/^\(.+\)$/.test(next)) {
            city = next.replace(/[()]/g, '');
          }
          break;
        }
      }

      if (home && away) {
        entries.push({ dateLine: currentDateHeader ?? '', dateISO: `${currentDateObj.year}-${String(currentDateObj.month + 1).padStart(2,'0')}-${String(currentDateObj.day).padStart(2,'0')}`, time: timeMatch[0], home, away, group, venue, stage, city });
      }
    }
  }

  return entries;
}

// Build matches from parsed schedule; times in RAW_SCHEDULE are IST (UTC+5:30)
const parsed = parseRawSchedule(RAW_SCHEDULE);
const scheduleMatches: Match[] = [];
for (const s of parsed) {
  // parse time
  const t = parseTimeString(s.time) ?? { hour: 0, minute: 0 };
  const dateISO = s.dateISO ?? '';
  const [y, m, d] = dateISO.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) continue;
  const utcIso = istDateTimeToUTCISO(y, m - 1, d, t.hour, t.minute);
  const home = getOrCreateTeam(s.home);
  const away = getOrCreateTeam(s.away);
  scheduleMatches.push({
    id: matchId++,
    homeTeam: home,
    awayTeam: away,
    utcDate: utcIso,
    status: computeMatchStatus(utcIso),
    stage: 'GROUP_STAGE',
    group: s.group,
    score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null }, winner: null },
    venue: s.venue ?? (s.city ? `${s.city}` : ''),
  });
}

const groupMatches: Match[] = scheduleMatches;

// Knockout placeholders
const knockoutMatches: Match[] = [];
const knockoutStages = [
  { name: 'ROUND_OF_32', count: 16 },
  { name: 'ROUND_OF_16', count: 8 },
  { name: 'QUARTER_FINAL', count: 4 },
  { name: 'SEMI_FINAL', count: 2 },
  { name: 'THIRD_PLACE', count: 1 },
  { name: 'FINAL', count: 1 },
];

const knockoutBaseDate = new Date('2026-07-03T18:00:00.000Z');
let knockoutIdx = 0;
for (const stage of knockoutStages) {
  for (let i = 0; i < stage.count; i++) {
    const dt = addHours(knockoutBaseDate, knockoutIdx * 12);
    const utcDate = dt.toISOString();
    const home: Team = { id: 2000 + knockoutIdx * 2 + 1, name: `TBD ${stage.name} H${i + 1}` };
    const away: Team = { id: 2000 + knockoutIdx * 2 + 2, name: `TBD ${stage.name} A${i + 1}` };
    knockoutMatches.push({
      id: matchId++,
      homeTeam: home,
      awayTeam: away,
      utcDate,
      status: computeMatchStatus(utcDate),
      stage: stage.name as Match['stage'],
      score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null }, winner: null },
      venue: venues[knockoutIdx % venues.length].name,
    });
    knockoutIdx++;
  }
}

const allMatches: Match[] = [...groupMatches, ...knockoutMatches];

// derive a sensible group stage base date from the parsed schedule (earliest scheduled match)
const groupBaseDate = scheduleMatches.length
  ? new Date(Math.min(...scheduleMatches.map((m) => new Date(m.utcDate).getTime())))
  : new Date('2026-06-12T00:00:00.000Z');

export const tournament: TournamentInfo = {
  id: 2026,
  name: 'FIFA World Cup 2026',
  emblem: '',
  area: { name: 'FIFA' },
  currentSeason: { startDate: groupBaseDate.toISOString(), endDate: addHours(knockoutBaseDate, knockoutIdx * 12).toISOString(), currentMatchday: 0 },
};

export function getAllMatches() {
  const matches = allMatches.map((m) => ({ ...m, status: computeMatchStatus(m.utcDate) }));
  return { matches };
}

export function getUpcomingMatches(limit: number = 10) {
  const m = allMatches
    .map((mm) => ({ ...mm, status: computeMatchStatus(mm.utcDate) }))
    .filter((x) => x.status === 'SCHEDULED')
    .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())
    .slice(0, limit);
  return { matches: m };
}

export function getLiveMatches() {
  const m = allMatches.map((mm) => ({ ...mm, status: computeMatchStatus(mm.utcDate) })).filter((x) => x.status === 'LIVE');
  return { matches: m };
}

export function getFinishedMatches() {
  const m = allMatches.map((mm) => ({ ...mm, status: computeMatchStatus(mm.utcDate) })).filter((x) => x.status === 'FINISHED');
  return { matches: m };
}

export function getMatchById(id: number) {
  const m = allMatches.find((mm) => mm.id === id);
  if (!m) return null;
  return { ...m, status: computeMatchStatus(m.utcDate) };
}

export function getStandings() {
  return { standings: groups };
}

export function getGroupStandings(name: string) {
  const group = groups.find((g) => g.name.toUpperCase() === name.toUpperCase());
  const matches = allMatches.filter((m) => m.group === (group?.name ?? undefined));
  return { group: group ?? null, matches };
}

export default {
  getAllMatches,
  getUpcomingMatches,
  getLiveMatches,
  getFinishedMatches,
  getMatchById,
  getStandings,
  getGroupStandings,
  tournament,
};
