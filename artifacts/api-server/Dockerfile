# Build from repo root — needs monorepo context for lib/* workspace packages
FROM node:18-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy monorepo root config files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy all workspace packages needed by api-server
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Build the api-server (esbuild compiles TS → dist/)
WORKDIR /app/artifacts/api-server
RUN pnpm run build

# Runtime
EXPOSE 5000
CMD ["node", "-r", "./load-env.cjs", "--enable-source-maps", "./dist/index.mjs"]
