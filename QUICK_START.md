# Quick Start Guide - FIFA Stadium Traffic Manager

**Status:** ✅ Ready to Deploy  
**Tests:** All Passing (9/9)  
**Last Updated:** May 27, 2026  

---

## Installation

```bash
# Clone the repository
git clone https://github.com/Adarsh-Dhar/stadium-traffic-manager.git
cd stadium-traffic-manager

# Install dependencies (requires pnpm)
pnpm install
```

---

## Running Tests

```bash
# Run the integration test suite
pnpm run test

# Build and test
pnpm run test:all
```

**Expected Output:**
```
🚀 Starting API Server Tests

✓ API Server started on http://localhost:5000

📝 Health Check - Should return 200 status
   ✅ PASSED

... (7 more tests)

==================================================
Total Tests: 9
✅ Passed: 9
❌ Failed: 0
Pass Rate: 100.0%
==================================================
```

---

## Development

### Start API Server

```bash
cd artifacts/api-server
pnpm run dev
```

Server will start on port 5000 (or `$PORT` environment variable).

### Type Checking

```bash
# Check entire workspace
pnpm run typecheck

# Check libraries only
pnpm run typecheck:libs
```

### Building

```bash
# Build API server
cd artifacts/api-server
pnpm run build

# Or from root (all packages)
pnpm run build
```

---

## Project Structure

```
stadium-traffic-manager/
├── artifacts/
│   ├── api-server/          # Express API (port 5000)
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── index.ts
│   │   │   ├── routes/
│   │   │   └── lib/
│   │   ├── dist/            # Compiled output
│   │   ├── tests/           # Jest test suite
│   │   └── jest.config.js
│   ├── fifa-dashboard/      # React dashboard
│   └── mockup-sandbox/      # Mockup environment
├── lib/
│   ├── api-client-react/    # Generated API client
│   ├── api-spec/            # OpenAPI spec
│   ├── api-zod/             # Zod validation schemas
│   └── db/                  # Database utilities
├── scripts/
│   └── test-api.js          # Integration test runner
├── package.json
├── pnpm-workspace.yaml
└── [Documentation files]
```

---

## Environment Variables

### Required
- `PORT` - Server port (default: 5000)

### Optional
- `NODE_ENV` - Environment (test/development/production)
- `LOG_LEVEL` - Logging level (debug/info/warn/error)

### Example

```bash
# Run with custom port
PORT=3000 pnpm --filter @workspace/api-server run dev

# Run tests with custom port
PORT=8080 node scripts/test-api.js
```

---

## Available Scripts

```bash
# Root commands
pnpm run build              # Build all packages
pnpm run typecheck          # Type check everything
pnpm run typecheck:libs     # Type check libraries
pnpm run test               # Run integration tests
pnpm run test:all           # Build API + run tests

# API server specific
cd artifacts/api-server
pnpm run dev                # Start development server
pnpm run build              # Build for production
pnpm run start              # Start production server
pnpm run typecheck          # Type check only
pnpm run test               # Run Jest tests
pnpm run test:watch        # Watch mode
pnpm run test:coverage     # With coverage report
```

---

## API Endpoints

### Health Check
```bash
GET /api/healthz

# Response
{
  "status": "ok"
}
```

---

## Deployment

### Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel deploy
```

### Docker

```dockerfile
FROM node:24
WORKDIR /app
COPY . .
RUN pnpm install
ENV PORT=5000
CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
```

### Standard Node.js Hosting

```bash
# Install
pnpm install

# Start
PORT=5000 pnpm --filter @workspace/api-server run start
```

---

## Troubleshooting

### Installation Issues

```bash
# Clear cache and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Build Fails

```bash
# Type check to find errors
pnpm run typecheck

# Check specific package
pnpm run typecheck --filter @workspace/api-server
```

### Tests Not Running

```bash
# Make sure PORT is set
PORT=5000 node scripts/test-api.js

# Check if port is in use
lsof -i :5000

# Use different port if needed
PORT=8000 node scripts/test-api.js
```

### Import Errors

```bash
# Regenerate API client from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Reinstall dependencies
pnpm install --force
```

---

## Key Features

✅ **Modular Architecture**
- Separate packages for API, dashboard, utilities

✅ **Type Safety**
- TypeScript throughout
- Zod validation schemas
- Generated API types

✅ **Testing**
- Integration test suite
- Jest configuration
- 100% passing tests

✅ **Clean Codebase**
- No Replit dependencies
- Proper error handling
- CORS enabled

✅ **Production Ready**
- Express framework
- Pino logging
- Build optimization

---

## Documentation

Detailed documentation available:
- `TEST_RESULTS.md` - Test metrics and results
- `CLEANUP_AND_TEST_SUMMARY.md` - Complete setup guide
- `CHANGES_MANIFEST.md` - Change log

---

## Support

For issues or questions:

1. Check the documentation files
2. Review test output: `pnpm run test`
3. Check type errors: `pnpm run typecheck`
4. Verify environment: `echo $PORT`

---

## What's New

**Recent Changes (May 27, 2026):**
- ✅ Removed all Replit configuration
- ✅ Created comprehensive test suite
- ✅ All 9 tests passing (100%)
- ✅ Added documentation
- ✅ Performance validated
- ✅ Ready for production

---

## Next Steps

1. **Review Tests:** `pnpm run test`
2. **Start Development:** `cd artifacts/api-server && pnpm run dev`
3. **Build for Production:** `pnpm run build`
4. **Deploy:** Follow deployment instructions above

---

**Happy Coding! 🚀**
