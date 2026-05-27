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

// --- Create teams (48 teams across groups A-L) ---
const TEAM_NAMES = [
  'USA','Mexico','Canada','Argentina','Brazil','England','France','Germany',
  'Spain','Portugal','Netherlands','Belgium','Italy','Croatia','Uruguay','Colombia',
  'Chile','Japan','South Korea','Saudi Arabia','Australia','Cameroon','Nigeria','Ghana',
  'Egypt','Morocco','Senegal','Peru','Ecuador','Bolivia','Paraguay','Costa Rica',
  'Panama','Honduras','Jamaica','Cuba','Venezuela','Iceland','Sweden','Denmark',
  'Norway','Switzerland','Austria','Poland','Czechia','Slovakia','Romania','Turkey'
];

const teams: Team[] = TEAM_NAMES.map((name, idx) => ({ id: 1000 + idx + 1, name, crest: '' }));

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

// --- Venues (16) ---
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

// --- Helpers to build schedule and status ---
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

// --- Generate 72 group-stage matches (6 per group) ---
const groupMatches: Match[] = [];
const groupBaseDate = new Date('2026-06-11T15:00:00.000Z');
let matchId = 1;
for (let gi = 0; gi < groups.length; gi++) {
  const grp = groups[gi];
  const t = grp.table.map((gt) => gt.team);
  const pairings: [number, number][] = [
    [0, 1],
    [2, 3],
    [0, 2],
    [1, 3],
    [0, 3],
    [1, 2],
  ];

  for (let pi = 0; pi < pairings.length; pi++) {
    const [a, b] = pairings[pi];
    const idx = gi * pairings.length + pi;
    const dt = addHours(groupBaseDate, idx * 6);
    const utcDate = dt.toISOString();
    groupMatches.push({
      id: matchId++,
      homeTeam: t[a],
      awayTeam: t[b],
      utcDate,
      status: computeMatchStatus(utcDate),
      stage: 'GROUP_STAGE',
      group: grp.name,
      score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null }, winner: null },
      venue: venues[(idx % venues.length)].name,
    });
  }
}

// --- Generate 32 knockout matches: R32 (16), R16 (8), QF (4), SF (2), 3rd (1), Final (1)
const knockoutMatches: Match[] = [];
const knockoutStages: { name: Match['stage']; count: number }[] = [
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
    // placeholders for teams (TBD names)
    const home: Team = { id: 2000 + knockoutIdx * 2 + 1, name: `TBD ${stage.name} H${i + 1}`, crest: '' };
    const away: Team = { id: 2000 + knockoutIdx * 2 + 2, name: `TBD ${stage.name} A${i + 1}`, crest: '' };
    knockoutMatches.push({
      id: matchId++,
      homeTeam: home,
      awayTeam: away,
      utcDate,
      status: computeMatchStatus(utcDate),
      stage: stage.name,
      score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null }, winner: null },
      venue: venues[(knockoutIdx % venues.length)].name,
    });
    knockoutIdx++;
  }
}

const allMatches: Match[] = [...groupMatches, ...knockoutMatches];

// --- Exports ---
export const tournament: TournamentInfo = {
  id: 2026,
  name: 'FIFA World Cup 2026',
  emblem: '',
  area: { name: 'FIFA' },
  currentSeason: { startDate: groupBaseDate.toISOString(), endDate: addHours(knockoutBaseDate, knockoutIdx * 12).toISOString(), currentMatchday: 0 },
};

export function getAllMatches() {
  // recompute statuses on call
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
// World Cup 2026 Static Data
// Complete dataset with matches, groups, venues, and standings

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

export interface Venue {
  id: number;
  name: string;
  city: string;
  country: string;
  capacity: number;
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

// Venues (16 stadiums across USA, Canada, Mexico)
const venues: Venue[] = [
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
];

// Teams (48 teams for WC 2026)
const teams = [
  { id: 1, name: "Argentina", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/1/1e/Argentina_national_football_team_logo.svg/1200px-Argentina_national_football_team_logo.svg.png" },
  { id: 2, name: "Brazil", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/6/65/Brazil_national_football_team_logo.svg/1200px-Brazil_national_football_team_logo.svg.png" },
  { id: 3, name: "France", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/a/a2/France_national_football_team_logo.svg/1200px-France_national_football_team_logo.svg.png" },
  { id: 4, name: "Germany", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/d/d1/Germany_national_football_team_logo.svg/1200px-Germany_national_football_team_logo.svg.png" },
  { id: 5, name: "Spain", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/f/f6/Spain_national_football_team_logo.svg/1200px-Spain_national_football_team_logo.svg.png" },
  { id: 6, name: "England", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/b/bf/England_national_football_team_logo.svg/1200px-England_national_football_team_logo.svg.png" },
  { id: 7, name: "Portugal", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/5/56/Portugal_national_football_team_logo.svg/1200px-Portugal_national_football_team_logo.svg.png" },
  { id: 8, name: "Netherlands", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/2/20/Netherlands_national_football_team_logo.svg/1200px-Netherlands_national_football_team_logo.svg.png" },
  { id: 9, name: "Belgium", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/4/46/Belgium_national_football_team_logo.svg/1200px-Belgium_national_football_team_logo.svg.png" },
  { id: 10, name: "Croatia", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/b/b3/Croatia_national_football_team_logo.svg/1200px-Croatia_national_football_team_logo.svg.png" },
  { id: 11, name: "Uruguay", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/5/5e/Uruguay_national_football_team_logo.svg/1200px-Uruguay_national_football_team_logo.svg.png" },
  { id: 12, name: "USA", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/a/a4/United_States_national_soccer_team_logo.svg/1200px-United_States_national_soccer_team_logo.svg.png" },
  { id: 13, name: "Mexico", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/6/68/Mexico_national_football_team_logo.svg/1200px-Mexico_national_football_team_logo.svg.png" },
  { id: 14, name: "Canada", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/6/6e/Canada_national_football_team_logo.svg/1200px-Canada_national_football_team_logo.svg.png" },
  { id: 15, name: "Morocco", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/2/2c/Morocco_national_football_team_logo.svg/1200px-Morocco_national_football_team_logo.svg.png" },
  { id: 16, name: "Japan", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/1/1f/Japan_national_football_team_logo.svg/1200px-Japan_national_football_team_logo.svg.png" },
  { id: 17, name: "South Korea", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/South_Korea_national_football_team_logo.svg/1200px-South_Korea_national_football_team_logo.svg.png" },
  { id: 18, name: "Australia", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/5/57/Australia_national_football_team_logo.svg/1200px-Australia_national_football_team_logo.svg.png" },
  { id: 19, name: "Senegal", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/2/2f/Senegal_national_football_team_logo.svg/1200px-Senegal_national_football_team_logo.svg.png" },
  { id: 20, name: "Switzerland", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/0/05/Switzerland_national_football_team_logo.svg/1200px-Switzerland_national_football_team_logo.svg.png" },
  { id: 21, name: "Poland", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/1/12/Poland_national_football_team_logo.svg/1200px-Poland_national_football_team_logo.svg.png" },
  { id: 22, name: "Denmark", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/9/9b/Denmark_national_football_team_logo.svg/1200px-Denmark_national_football_team_logo.svg.png" },
  { id: 23, name: "Italy", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/0/05/Italy_national_football_team_logo.svg/1200px-Italy_national_football_team_logo.svg.png" },
  { id: 24, name: "Serbia", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/f/f1/Serbia_national_football_team_logo.svg/1200px-Serbia_national_football_team_logo.svg.png" },
  { id: 25, name: "Ecuador", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/4/4e/Ecuador_national_football_team_logo.svg/1200px-Ecuador_national_football_team_logo.svg.png" },
  { id: 26, name: "Colombia", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/2/21/Colombia_national_football_team_logo.svg/1200px-Colombia_national_football_team_logo.svg.png" },
  { id: 27, name: "Nigeria", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/5/5c/Nigeria_national_football_team_logo.svg/1200px-Nigeria_national_football_team_logo.svg.png" },
  { id: 28, name: "Egypt", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/f/f9/Egypt_national_football_team_logo.svg/1200px-Egypt_national_football_team_logo.svg.png" },
  { id: 29, name: "Tunisia", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/c/c1/Tunisia_national_football_team_logo.svg/1200px-Tunisia_national_football_team_logo.svg.png" },
  { id: 30, name: "Ghana", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/2/23/Ghana_national_football_team_logo.svg/1200px-Ghana_national_football_team_logo.svg.png" },
  { id: 31, name: "Cameroon", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/1/19/Cameroon_national_football_team_logo.svg/1200px-Cameroon_national_football_team_logo.svg.png" },
  { id: 32, name: "Ivory Coast", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/4/4f/Ivory_Coast_national_football_team_logo.svg/1200px-Ivory_Coast_national_football_team_logo.svg.png" },
  { id: 33, name: "Iran", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/c/c3/Iran_national_football_team_logo.svg/1200px-Iran_national_football_team_logo.svg.png" },
  { id: 34, name: "Saudi Arabia", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/4/48/Saudi_Arabia_national_football_team_logo.svg/1200px-Saudi_Arabia_national_football_team_logo.svg.png" },
  { id: 35, name: "Qatar", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/6/67/Qatar_national_football_team_logo.svg/1200px-Qatar_national_football_team_logo.svg.png" },
  { id: 36, name: "United Arab Emirates", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/6/6a/United_Arab_Emirates_national_football_team_logo.svg/1200px-United_Arab_Emirates_national_football_team_logo.svg.png" },
  { id: 37, name: "China", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/0/0e/China_national_football_team_logo.svg/1200px-China_national_football_team_logo.svg.png" },
  { id: 38, name: "New Zealand", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/a/ae/New_Zealand_national_football_team_logo.svg/1200px-New_Zealand_national_football_team_logo.svg.png" },
  { id: 39, name: "Costa Rica", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/4/4f/Costa_Rica_national_football_team_logo.svg/1200px-Costa_Rica_national_football_team_logo.svg.png" },
  { id: 40, name: "Panama", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/5/5b/Panama_national_football_team_logo.svg/1200px-Panama_national_football_team_logo.svg.png" },
  { id: 41, name: "Jamaica", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/0/0a/Jamaica_national_football_team_logo.svg/1200px-Jamaica_national_football_team_logo.svg.png" },
  { id: 42, name: "Honduras", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Honduras_national_football_team_logo.svg/1200px-Honduras_national_football_team_logo.svg.png" },
  { id: 43, name: "Paraguay", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/5/5b/Paraguay_national_football_team_logo.svg/1200px-Paraguay_national_football_team_logo.svg.png" },
  { id: 44, name: "Chile", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/8/82/Chile_national_football_team_logo.svg/1200px-Chile_national_football_team_logo.svg.png" },
  { id: 45, name: "Peru", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/5/5c/Peru_national_football_team_logo.svg/1200px-Peru_national_football_team_logo.svg.png" },
  { id: 46, name: "Venezuela", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/4/4f/Venezuela_national_football_team_logo.svg/1200px-Venezuela_national_football_team_logo.svg.png" },
  { id: 47, name: "Bolivia", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/5/5c/Bolivia_national_football_team_logo.svg/1200px-Bolivia_national_football_team_logo.svg.png" },
  { id: 48, name: "Wales", crest: "https://upload.wikimedia.org/wikipedia/en/thumb/b/b3/Wales_national_football_team_logo.svg/1200px-Wales_national_football_team_logo.svg.png" },
];

// Group assignments (12 groups, 4 teams each)
const groupAssignments: Record<string, number[]> = {
  A: [1, 12, 25, 38], // Argentina, USA, Ecuador, New Zealand
  B: [2, 13, 26, 39], // Brazil, Mexico, Colombia, Costa Rica
  C: [3, 14, 27, 40], // France, Canada, Nigeria, Panama
  D: [4, 15, 28, 41], // Germany, Morocco, Egypt, Jamaica
  E: [5, 16, 29, 42], // Spain, Japan, Tunisia, Honduras
  F: [6, 17, 30, 43], // England, South Korea, Ghana, Paraguay
  G: [7, 18, 31, 44], // Portugal, Australia, Iran, Chile
  H: [8, 19, 32, 45], // Netherlands, Senegal, Ivory Coast, Peru
  I: [9, 20, 33, 46], // Belgium, Switzerland, Iran, Venezuela
  J: [10, 21, 34, 47], // Croatia, Poland, Saudi Arabia, Bolivia
  K: [11, 22, 35, 48], // Uruguay, Denmark, Qatar, Wales
  L: [23, 24, 36, 37], // Italy, Serbia, UAE, China
};

// Initialize groups with teams at 0 points
const groups: Record<string, Group> = {};
Object.keys(groupAssignments).forEach((groupName) => {
  const teamIds = groupAssignments[groupName];
  groups[groupName] = {
    name: groupName,
    table: teamIds.map((teamId, index) => ({
      position: index + 1,
      team: teams[teamId - 1],
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
    })),
  };
});

// Generate matches (104 total: 72 group stage + 32 knockout)
const matches: Match[] = [];
let matchId = 1;

// Group stage matches (6 matches per group = 72 total)
const groupStages = [
  // Group A
  { home: 1, away: 12, venue: 11, date: "2026-06-11T16:00:00Z", group: "A" },
  { home: 25, away: 38, venue: 14, date: "2026-06-11T19:00:00Z", group: "A" },
  { home: 1, away: 25, venue: 1, date: "2026-06-16T16:00:00Z", group: "A" },
  { home: 12, away: 38, venue: 15, date: "2026-06-16T19:00:00Z", group: "A" },
  { home: 1, away: 38, venue: 6, date: "2026-06-21T16:00:00Z", group: "A" },
  { home: 12, away: 25, venue: 10, date: "2026-06-21T19:00:00Z", group: "A" },
  // Group B
  { home: 2, away: 13, venue: 12, date: "2026-06-12T16:00:00Z", group: "B" },
  { home: 26, away: 39, venue: 16, date: "2026-06-12T19:00:00Z", group: "B" },
  { home: 2, away: 26, venue: 2, date: "2026-06-17T16:00:00Z", group: "B" },
  { home: 13, away: 39, venue: 7, date: "2026-06-17T19:00:00Z", group: "B" },
  { home: 2, away: 39, venue: 5, date: "2026-06-22T16:00:00Z", group: "B" },
  { home: 13, away: 26, venue: 8, date: "2026-06-22T19:00:00Z", group: "B" },
  // Group C
  { home: 3, away: 14, venue: 14, date: "2026-06-13T16:00:00Z", group: "C" },
  { home: 27, away: 40, venue: 6, date: "2026-06-13T19:00:00Z", group: "C" },
  { home: 3, away: 27, venue: 3, date: "2026-06-18T16:00:00Z", group: "C" },
  { home: 14, away: 40, venue: 9, date: "2026-06-18T19:00:00Z", group: "C" },
  { home: 3, away: 40, venue: 4, date: "2026-06-23T16:00:00Z", group: "C" },
  { home: 14, away: 27, venue: 10, date: "2026-06-23T19:00:00Z", group: "C" },
  // Group D
  { home: 4, away: 15, venue: 15, date: "2026-06-13T16:00:00Z", group: "D" },
  { home: 28, away: 41, venue: 11, date: "2026-06-13T19:00:00Z", group: "D" },
  { home: 4, away: 28, venue: 1, date: "2026-06-18T16:00:00Z", group: "D" },
  { home: 15, away: 41, venue: 13, date: "2026-06-18T19:00:00Z", group: "D" },
  { home: 4, away: 41, venue: 7, date: "2026-06-23T16:00:00Z", group: "D" },
  { home: 15, away: 28, venue: 5, date: "2026-06-23T19:00:00Z", group: "D" },
  // Group E
  { home: 5, away: 16, venue: 16, date: "2026-06-14T16:00:00Z", group: "E" },
  { home: 29, away: 42, venue: 12, date: "2026-06-14T19:00:00Z", group: "E" },
  { home: 5, away: 29, venue: 3, date: "2026-06-19T16:00:00Z", group: "E" },
  { home: 16, away: 42, venue: 9, date: "2026-06-19T19:00:00Z", group: "E" },
  { home: 5, away: 42, venue: 8, date: "2026-06-24T16:00:00Z", group: "E" },
  { home: 16, away: 29, venue: 4, date: "2026-06-24T19:00:00Z", group: "E" },
  // Group F
  { home: 6, away: 17, venue: 9, date: "2026-06-14T16:00:00Z", group: "F" },
  { home: 30, away: 43, venue: 13, date: "2026-06-14T19:00:00Z", group: "F" },
  { home: 6, away: 30, venue: 2, date: "2026-06-19T16:00:00Z", group: "F" },
  { home: 17, away: 43, venue: 15, date: "2026-06-19T19:00:00Z", group: "F" },
  { home: 6, away: 43, venue: 10, date: "2026-06-24T16:00:00Z", group: "F" },
  { home: 17, away: 30, venue: 6, date: "2026-06-24T19:00:00Z", group: "F" },
  // Group G
  { home: 7, away: 18, venue: 13, date: "2026-06-15T16:00:00Z", group: "G" },
  { home: 31, away: 44, venue: 16, date: "2026-06-15T19:00:00Z", group: "G" },
  { home: 7, away: 31, venue: 3, date: "2026-06-20T16:00:00Z", group: "G" },
  { home: 18, away: 44, venue: 14, date: "2026-06-20T19:00:00Z", group: "G" },
  { home: 7, away: 44, venue: 5, date: "2026-06-25T16:00:00Z", group: "G" },
  { home: 18, away: 31, venue: 7, date: "2026-06-25T19:00:00Z", group: "G" },
  // Group H
  { home: 8, away: 19, venue: 12, date: "2026-06-15T16:00:00Z", group: "H" },
  { home: 32, away: 45, venue: 11, date: "2026-06-15T19:00:00Z", group: "H" },
  { home: 8, away: 32, venue: 1, date: "2026-06-20T16:00:00Z", group: "H" },
  { home: 19, away: 45, venue: 15, date: "2026-06-20T19:00:00Z", group: "H" },
  { home: 8, away: 45, venue: 8, date: "2026-06-25T16:00:00Z", group: "H" },
  { home: 19, away: 32, venue: 4, date: "2026-06-25T19:00:00Z", group: "H" },
  // Group I
  { home: 9, away: 20, venue: 15, date: "2026-06-16T16:00:00Z", group: "I" },
  { home: 33, away: 46, venue: 14, date: "2026-06-16T19:00:00Z", group: "I" },
  { home: 9, away: 33, venue: 2, date: "2026-06-21T16:00:00Z", group: "I" },
  { home: 20, away: 46, venue: 12, date: "2026-06-21T19:00:00Z", group: "I" },
  { home: 9, away: 46, venue: 6, date: "2026-06-26T16:00:00Z", group: "I" },
  { home: 20, away: 33, venue: 9, date: "2026-06-26T19:00:00Z", group: "I" },
  // Group J
  { home: 10, away: 21, venue: 16, date: "2026-06-16T16:00:00Z", group: "J" },
  { home: 34, away: 47, venue: 13, date: "2026-06-16T19:00:00Z", group: "J" },
  { home: 10, away: 34, venue: 3, date: "2026-06-21T16:00:00Z", group: "J" },
  { home: 21, away: 47, venue: 11, date: "2026-06-21T19:00:00Z", group: "J" },
  { home: 10, away: 47, venue: 7, date: "2026-06-26T16:00:00Z", group: "J" },
  { home: 21, away: 34, venue: 5, date: "2026-06-26T19:00:00Z", group: "J" },
  // Group K
  { home: 11, away: 22, venue: 14, date: "2026-06-17T16:00:00Z", group: "K" },
  { home: 35, away: 48, venue: 12, date: "2026-06-17T19:00:00Z", group: "K" },
  { home: 11, away: 35, venue: 1, date: "2026-06-22T16:00:00Z", group: "K" },
  { home: 22, away: 48, venue: 16, date: "2026-06-22T19:00:00Z", group: "K" },
  { home: 11, away: 48, venue: 8, date: "2026-06-27T16:00:00Z", group: "K" },
  { home: 22, away: 35, venue: 4, date: "2026-06-27T19:00:00Z", group: "K" },
  // Group L
  { home: 23, away: 24, venue: 11, date: "2026-06-17T16:00:00Z", group: "L" },
  { home: 36, away: 37, venue: 15, date: "2026-06-17T19:00:00Z", group: "L" },
  { home: 23, away: 36, venue: 3, date: "2026-06-22T16:00:00Z", group: "L" },
  { home: 24, away: 37, venue: 13, date: "2026-06-22T19:00:00Z", group: "L" },
  { home: 23, away: 37, venue: 10, date: "2026-06-27T16:00:00Z", group: "L" },
  { home: 24, away: 36, venue: 6, date: "2026-06-27T19:00:00Z", group: "L" },
];

// Add group stage matches
groupStages.forEach((m) => {
  matches.push({
    id: matchId++,
    homeTeam: teams[m.home - 1],
    awayTeam: teams[m.away - 1],
    utcDate: m.date,
    status: computeMatchStatus(m.date),
    stage: "GROUP_STAGE",
    group: m.group,
    score: {
      fullTime: { home: null, away: null },
      halfTime: { home: null, away: null },
      winner: null,
    },
    venue: venues[m.venue - 1].name,
  });
});

// Knockout stage matches (32 total)
const knockoutStages = [
  // Round of 32 (16 matches)
  { home: 1, away: 2, venue: 1, date: "2026-06-29T16:00:00Z", stage: "ROUND_OF_32" },
  { home: 3, away: 4, venue: 2, date: "2026-06-29T19:00:00Z", stage: "ROUND_OF_32" },
  { home: 5, away: 6, venue: 3, date: "2026-06-30T16:00:00Z", stage: "ROUND_OF_32" },
  { home: 7, away: 8, venue: 4, date: "2026-06-30T19:00:00Z", stage: "ROUND_OF_32" },
  { home: 9, away: 10, venue: 5, date: "2026-07-01T16:00:00Z", stage: "ROUND_OF_32" },
  { home: 11, away: 12, venue: 6, date: "2026-07-01T19:00:00Z", stage: "ROUND_OF_32" },
  { home: 13, away: 14, venue: 7, date: "2026-07-02T16:00:00Z", stage: "ROUND_OF_32" },
  { home: 15, away: 16, venue: 8, date: "2026-07-02T19:00:00Z", stage: "ROUND_OF_32" },
  { home: 17, away: 18, venue: 9, date: "2026-07-03T16:00:00Z", stage: "ROUND_OF_32" },
  { home: 19, away: 20, venue: 10, date: "2026-07-03T19:00:00Z", stage: "ROUND_OF_32" },
  { home: 21, away: 22, venue: 11, date: "2026-07-04T16:00:00Z", stage: "ROUND_OF_32" },
  { home: 23, away: 24, venue: 12, date: "2026-07-04T19:00:00Z", stage: "ROUND_OF_32" },
  { home: 25, away: 26, venue: 13, date: "2026-07-05T16:00:00Z", stage: "ROUND_OF_32" },
  { home: 27, away: 28, venue: 14, date: "2026-07-05T19:00:00Z", stage: "ROUND_OF_32" },
  { home: 29, away: 30, venue: 15, date: "2026-07-06T16:00:00Z", stage: "ROUND_OF_32" },
  { home: 31, away: 32, venue: 16, date: "2026-07-06T19:00:00Z", stage: "ROUND_OF_32" },
  // Round of 16 (8 matches)
  { home: 33, away: 34, venue: 1, date: "2026-07-09T16:00:00Z", stage: "ROUND_OF_16" },
  { home: 35, away: 36, venue: 2, date: "2026-07-09T19:00:00Z", stage: "ROUND_OF_16" },
  { home: 37, away: 38, venue: 3, date: "2026-07-10T16:00:00Z", stage: "ROUND_OF_16" },
  { home: 39, away: 40, venue: 4, date: "2026-07-10T19:00:00Z", stage: "ROUND_OF_16" },
  { home: 41, away: 42, venue: 5, date: "2026-07-11T16:00:00Z", stage: "ROUND_OF_16" },
  { home: 43, away: 44, venue: 6, date: "2026-07-11T19:00:00Z", stage: "ROUND_OF_16" },
  { home: 45, away: 46, venue: 7, date: "2026-07-12T16:00:00Z", stage: "ROUND_OF_16" },
  { home: 47, away: 48, venue: 8, date: "2026-07-12T19:00:00Z", stage: "ROUND_OF_16" },
  // Quarter-finals (4 matches)
  { home: 1, away: 3, venue: 9, date: "2026-07-15T16:00:00Z", stage: "QUARTER_FINAL" },
  { home: 5, away: 7, venue: 10, date: "2026-07-15T19:00:00Z", stage: "QUARTER_FINAL" },
  { home: 9, away: 11, venue: 11, date: "2026-07-16T16:00:00Z", stage: "QUARTER_FINAL" },
  { home: 13, away: 15, venue: 12, date: "2026-07-16T19:00:00Z", stage: "QUARTER_FINAL" },
  // Semi-finals (2 matches)
  { home: 2, away: 4, venue: 13, date: "2026-07-19T16:00:00Z", stage: "SEMI_FINAL" },
  { home: 6, away: 8, venue: 14, date: "2026-07-19T19:00:00Z", stage: "SEMI_FINAL" },
  // Third-place match (1 match)
  { home: 10, away: 12, venue: 15, date: "2026-07-23T16:00:00Z", stage: "THIRD_PLACE" },
  // Final (1 match)
  { home: 1, away: 2, venue: 1, date: "2026-07-26T19:00:00Z", stage: "FINAL" },
];

// Add knockout stage matches
knockoutStages.forEach((m) => {
  matches.push({
    id: matchId++,
    homeTeam: teams[m.home - 1],
    awayTeam: teams[m.away - 1],
    utcDate: m.date,
    status: computeMatchStatus(m.date),
    stage: m.stage,
    score: {
      fullTime: { home: null, away: null },
      halfTime: { home: null, away: null },
      winner: null,
    },
    venue: venues[m.venue - 1].name,
  });
});

// Compute match status based on current time
function computeMatchStatus(matchDate: string): 'SCHEDULED' | 'LIVE' | 'FINISHED' {
  const now = new Date();
  const matchTime = new Date(matchDate);
  const matchEnd = new Date(matchTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours after start
  
  if (now < matchTime) {
    return 'SCHEDULED';
  } else if (now >= matchTime && now < matchEnd) {
    return 'LIVE';
  } else {
    return 'FINISHED';
  }
}

// Tournament info
export const tournament: TournamentInfo = {
  id: 2000,
  name: "FIFA World Cup 2026",
  emblem: "https://upload.wikimedia.org/wikipedia/en/thumb/3/3c/FIFA_World_Cup_2026_logo.svg/1200px-FIFA_World_Cup_2026_logo.svg.png",
  area: { name: "World" },
  currentSeason: {
    startDate: "2026-06-11",
    endDate: "2026-07-26",
    currentMatchday: 1,
  },
};

// Export functions
export function getAllMatches(): { matches: Match[] } {
  return { matches };
}

export function getUpcomingMatches(limit: number = 10): { matches: Match[] } {
  const upcoming = matches.filter(m => m.status === 'SCHEDULED').slice(0, limit);
  return { matches: upcoming };
}

export function getLiveMatches(): { matches: Match[] } {
  const live = matches.filter(m => m.status === 'LIVE');
  return { matches: live };
}

export function getFinishedMatches(): { matches: Match[] } {
  const finished = matches.filter(m => m.status === 'FINISHED');
  return { matches: finished };
}

export function getMatchById(id: number): Match | null {
  return matches.find(m => m.id === id) || null;
}

export function getStandings(): { standings: Group[] } {
  return { standings: Object.values(groups) };
}

export function getGroupByName(name: string): Group | null {
  return groups[name.toUpperCase()] || null;
}

export function getGroupStandings(name: string): { group: Group; matches: Match[] } {
  const group = getGroupByName(name);
  if (!group) {
    return { group: null as any, matches: [] };
  }
  const groupMatches = matches.filter(m => m.group === name.toUpperCase());
  return { group, matches: groupMatches };
}

export function getVenues(): Venue[] {
  return venues;
}
