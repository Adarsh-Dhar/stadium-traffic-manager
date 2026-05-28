FROM node:20-slim
RUN npm install -g pnpm

WORKDIR /app

# Copy lockfile and package.json first to cache dependencies
COPY pnpm-lock.yaml package.json ./
# If you have a workspace, copy the workspace file too
COPY pnpm-workspace.yaml* ./

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Copy your source code
COPY . .

CMD ["node", "watchdog/index.js"]