FROM node:20-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
ENV PORT=3000 BASE_PATH=/
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist/public ./public
EXPOSE 3000
CMD ["serve", "-s", "public", "-l", "3000"]
