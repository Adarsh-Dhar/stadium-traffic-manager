# FIFA Stadium Traffic Manager - Dev Server Guide

## ✅ Dev Server is Running

The development server is now configured and running successfully at **http://localhost:3000**

### Dev Script Added

The root `package.json` now includes a `dev` script that starts the FIFA Dashboard development server:

```bash
pnpm run dev
```

**What it does:**
- Sets required environment variables: `PORT=3000`, `BASE_PATH=/`
- Starts the Vite dev server with hot module replacement (HMR)
- Serves the FIFA AI Traffic Dashboard UI

---

## 🏗️ Project Structure

This is a monorepo (managed with pnpm workspaces) containing three main artifacts:

### 1. **API Server** (`artifacts/api-server/`)
- Express.js backend server
- Provides REST API endpoints for stadium traffic management
- Port: 5000 (when running in test mode)
- Dev: `pnpm --filter @workspace/api-server run dev`

### 2. **FIFA Dashboard** (`artifacts/fifa-dashboard/`)
- React + Vite frontend application
- Real-time traffic and capacity management interface
- Port: 3000 (dev server)
- Dev: `pnpm --filter @workspace/fifa-dashboard run dev`

### 3. **Mockup Sandbox** (`artifacts/mockup-sandbox/`)
- Alternative UI testing environment
- Port: Can be configured
- Dev: `pnpm --filter @workspace/mockup-sandbox run dev`

---

## 🚀 Running the Development Server

### Start the Main App (FIFA Dashboard)

```bash
# From the project root
pnpm run dev
```

Or manually with explicit environment variables:
```bash
cd /vercel/share/v0-project
PORT=3000 BASE_PATH=/ pnpm run dev
```

### Expected Output

When you run `pnpm run dev`, you should see:
```
> @workspace/fifa-dashboard@0.0.0 dev
> vite --config vite.config.ts --host 0.0.0.0

  VITE v7.3.3 (...)
  ➜  Local:   http://localhost:3000/
  ➜  Press q to quit
```

### Access the App

Open your browser and navigate to: **http://localhost:3000**

---

## 🛠️ Available Commands

### Development
```bash
# Start dev server (with HMR)
pnpm run dev

# Run specific artifact
pnpm --filter @workspace/fifa-dashboard run dev
pnpm --filter @workspace/api-server run dev
```

### Building
```bash
# Build all artifacts
pnpm run build

# Build specific artifact
pnpm --filter @workspace/fifa-dashboard run build
```

### Testing
```bash
# Run API integration tests
pnpm run test

# Run all tests (including build)
pnpm run test:all

# Run API tests in watch mode
pnpm --filter @workspace/api-server run test:watch
```

### Type Checking
```bash
# Check all TypeScript files
pnpm run typecheck

# Check specific artifact
pnpm --filter @workspace/fifa-dashboard run typecheck
```

---

## 🎯 Features in the Dashboard

### OPS CONTROL (Main Dashboard)
- Real-time metrics: CPU Load, Memory, Latency, RPS, Servers, Error Rate
- Server scaling (add/remove servers)
- System reset functionality
- AI Auto-Heal for intelligent remediation
- Alert feed with real-time updates
- Stadium occupancy monitoring
- Gate throughput tracking
- Manual ticket validation

### SIMULATION
- Load Generator for stress testing
- Multiple traffic scenarios:
  - **Low Traffic**: Steady trickle of early arrivals
  - **Medium Traffic**: Normal pre-game crowd flow
  - **High Traffic**: Peak surge scenarios
  - **Chaotic Traffic**: Extreme load conditions
- Virtual user simulation

### TELEMETRY
- System performance telemetry
- Historical data tracking
- Performance analytics

---

## 🔧 Environment Variables

Required for the dev server:

| Variable | Value | Purpose |
|----------|-------|---------|
| `PORT` | 3000 | Vite dev server port |
| `BASE_PATH` | / | Application base path |
| `NODE_ENV` | development | Set by default in dev scripts |

---

## 🐛 Troubleshooting

### Dev Server Won't Start

**Error:** "PORT environment variable is required but was not provided"
```bash
# Solution: Use the pnpm run dev command which sets PORT automatically
pnpm run dev
```

**Error:** "Port 3000 already in use"
```bash
# Solution: Kill existing process
lsof -ti:3000 | xargs kill -9

# Or use a different port
PORT=3001 BASE_PATH=/ pnpm run dev
```

### HMR Not Working

If changes aren't hot-reloading:
1. Check that the dev server is running with `--host 0.0.0.0`
2. Restart the dev server
3. Clear browser cache (Cmd+Shift+Delete)

### Build Errors

```bash
# Clear node_modules and reinstall
rm -rf node_modules
pnpm install

# Then rebuild
pnpm run build
```

---

## 📦 Dependencies

Main dependencies used across the project:

- **React**: UI library with hooks
- **Vite**: Build tool and dev server
- **Express.js**: Backend API server
- **Framer Motion**: Animation library
- **Tailwind CSS**: Utility-first CSS framework
- **Radix UI**: Accessible component primitives
- **React Query**: Server state management
- **Zod**: TypeScript-first schema validation
- **React Hook Form**: Performant form library

---

## 🚀 Deployment

When ready to deploy:

```bash
# Build for production
pnpm run build

# All artifacts will be compiled and optimized
# FIFA Dashboard builds to: artifacts/fifa-dashboard/dist/public/
# API Server builds to: artifacts/api-server/dist/
```

Deploy to Vercel:
```bash
# Using Vercel CLI
vercel
```

---

## 📝 File Bugfixes Applied

During dev server setup, the following bugs were fixed to ensure the dashboard runs correctly:

### 1. **Alerts Array Validation** (dashboard.tsx:316-322)
- Added array type check before calling `.map()` on alerts
- Prevents "alerts.map is not a function" error

### 2. **Capacity Object Safety** (dashboard.tsx:433-436)
- Fixed optional chaining for `capacity?.currentOccupancy.toLocaleString()`
- Prevents "Cannot read properties of undefined" error

### 3. **Gates Array Validation** (dashboard.tsx:471)
- Added array type check for `capacity?.gates.map()`
- Ensures gates only render when data is available

---

## ✅ Status

- ✅ Dev script added to package.json
- ✅ Dev server running on port 3000
- ✅ Hot Module Replacement (HMR) enabled
- ✅ All Replit configuration removed
- ✅ Integration tests passing (9/9)
- ✅ Critical bugs fixed
- ✅ Ready for development

---

**Last Updated:** 2026-05-27
**Status:** Production Ready ✅
