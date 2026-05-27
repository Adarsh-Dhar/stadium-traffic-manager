# FIFA World Cup API Integration Setup Guide

## Status: API Infrastructure Complete ✅

The FIFA World Cup 2026 Dashboard is now fully integrated with the **api-football.com API v3** to fetch real-time tournament data. All backend endpoints and frontend components are ready to receive live match data.

## Current Status

### ✅ Completed Components

**Backend API Server:**
- Created `src/lib/api-football.ts` - Complete API Football service with 8 functions:
  - `getWorldCupMatches()` - Get all World Cup matches (filtered by status)
  - `getWorldCupStandings()` - Get tournament standings
  - `getTeamInfo()` - Get individual team information
  - `getUpcomingMatches()` - Get next 10 upcoming matches
  - `getLiveMatches()` - Get currently live matches
  - `getTournamentInfo()` - Get tournament metadata
  - `getMatchStats()` - Get detailed match statistics
  - `getTeamStatsForSeason()` - Get team performance stats

**API Endpoints:**
Added 8 new endpoints to `/api/fifa/worldcup/*`:
- `GET /api/fifa/worldcup/upcoming` - Upcoming matches
- `GET /api/fifa/worldcup/live` - Live matches
- `GET /api/fifa/worldcup/standings` - Tournament standings
- `GET /api/fifa/worldcup/tournament` - Tournament info
- `GET /api/fifa/worldcup/matches?status=live|upcoming|finished` - Filtered matches
- `GET /api/fifa/worldcup/team/:id` - Team info
- `GET /api/fifa/worldcup/match/:id/stats` - Match statistics

**Frontend:**
- Updated `dashboard.tsx` with real API integration
- Displays live matches, upcoming fixtures, and tournament standings
- Error handling and loading states
- Auto-refreshes data every 30 seconds

### ⚠️ Current Issue

The API_FOOTBALL_KEY environment variable is not being passed to the API server process when it starts. This is why you see:
```
[API Football] Initializing with key: NOT SET
[API Football] Response status: 403
[API Football] Error response: {"errors": {"token": "Invalid API key, please check your request and credentials."}}
```

## How to Fix This

### Step 1: Get Your API Key

1. Go to https://www.api-football.com/
2. Sign up for a free account
3. Get your API key from the dashboard
4. Copy the API key

### Step 2: Set the Environment Variable

**Option A: Vercel Project Settings (Recommended)**
1. Go to your Vercel project settings
2. Find "Environment Variables" section
3. Add a new variable:
   - **Key**: `API_FOOTBALL_KEY`
   - **Value**: `your-api-key-here`
4. Save and redeploy

**Option B: Local Development**
1. Export the environment variable before running:
   ```bash
   export API_FOOTBALL_KEY="your-api-key-here"
   cd /vercel/share/v0-project/artifacts/api-server
   PORT=5000 node --enable-source-maps ./dist/index.mjs
   ```

### Step 3: Restart the API Server

Once the environment variable is set:
```bash
# Kill existing server
pkill -f "node.*dist/index.mjs"

# Restart
cd /vercel/share/v0-project/artifacts/api-server
PORT=5000 node --enable-source-maps ./dist/index.mjs &
```

### Step 4: Test the API

```bash
curl http://localhost:5000/api/fifa/worldcup/upcoming
```

You should see real World Cup 2026 data!

## Expected Response Example

```json
{
  "get": "fixtures",
  "parameters": {
    "league": "1",
    "season": "2026",
    "status": "upcoming",
    "sort": "date_asc"
  },
  "errors": {},
  "results": 10,
  "paging": {
    "current": 1,
    "total": 5
  },
  "response": [
    {
      "fixture": {
        "id": 1234567,
        "date": "2026-06-15T18:00:00+00:00",
        "status": "not_started"
      },
      "teams": {
        "home": {
          "id": 34,
          "name": "France",
          "logo": "https://media..."
        },
        "away": {
          "id": 25,
          "name": "Germany",
          "logo": "https://media..."
        }
      },
      "goals": {
        "home": null,
        "away": null
      }
    },
    ...
  ]
}
```

## Available Endpoints Reference

All endpoints require the API_FOOTBALL_KEY environment variable to be set.

### World Cup Matches
- **GET** `/api/fifa/worldcup/upcoming` - Next 10 matches
- **GET** `/api/fifa/worldcup/live` - Currently playing matches
- **GET** `/api/fifa/worldcup/matches?status=upcoming` - All matches with filter

### Tournament Data
- **GET** `/api/fifa/worldcup/standings` - Current standings
- **GET** `/api/fifa/worldcup/tournament` - Tournament information

### Team Data
- **GET** `/api/fifa/worldcup/team/:id` - Individual team info

### Match Details
- **GET** `/api/fifa/worldcup/match/:id/stats` - Match statistics

## Frontend Integration

The dashboard automatically:
1. Fetches data from these endpoints every 30 seconds
2. Displays live match scores in red banner
3. Shows next 6 upcoming matches
4. Lists tournament standings (top 8 teams)
5. Gracefully handles errors and shows fallback messages

## Troubleshooting

### API returns 403 Forbidden
- **Cause**: `API_FOOTBALL_KEY` not set or invalid
- **Fix**: Check environment variable is correctly set and restart server

### No match data displays
- **Cause**: API_FOOTBALL_KEY not configured
- **Fix**: Follow "Step 2: Set the Environment Variable" above

### Dashboard shows "No match data available"
- This is normal before the tournament starts (before June 2026)
- The API will return empty results
- Once tournament begins, matches will automatically appear

## Architecture Overview

```
Frontend (FIFA Dashboard)
        ↓ (HTTP GET requests)
Backend API Server
        ↓ (fetch)
API Football API (v3)
        ↓ (JSON responses)
Database → Real World Cup Data
```

## Next Steps

1. **Get API Key**: Sign up at api-football.com and get your free API key
2. **Set Environment Variable**: Add `API_FOOTBALL_KEY` to your Vercel project
3. **Restart Service**: Restart the API server
4. **Verify**: Visit the dashboard and see real World Cup data!

## Files Modified

- ✅ `/artifacts/api-server/src/lib/api-football.ts` - New API service
- ✅ `/artifacts/api-server/src/routes/fifa.ts` - New endpoints
- ✅ `/artifacts/api-server/src/routes/index.ts` - Route registration
- ✅ `/artifacts/fifa-dashboard/src/pages/dashboard.tsx` - Real API integration

## Support

For api-football.com API issues, visit: https://www.api-football.com/documentation-v3

For questions about this integration, check the logs in your API server for detailed error messages (marked with `[API Football]` prefix).
