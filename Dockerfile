# Single-image build: builds the React client, then runs the Express server
# which serves both the API and the built client.
FROM node:20-slim AS build
WORKDIR /app

# Install client deps + build
COPY client/package*.json ./client/
RUN cd client && npm install
COPY client ./client
RUN cd client && npm run build

# Install server deps (also generates Prisma client via postinstall)
COPY server/package*.json ./server/
COPY server/prisma ./server/prisma
RUN cd server && npm install
COPY server ./server

# Runtime image
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist

WORKDIR /app/server
EXPOSE 4000

# Sync the schema to the database on boot, seed data if empty, then start.
# `db push` is idempotent; the seed upserts by phone+program+location so it
# never duplicates on redeploys. Seed failure won't block the server starting.
CMD ["sh", "-c", "npx prisma db push --accept-data-loss --skip-generate && (node prisma/seed.js || echo 'Seed skipped/failed — starting server anyway') && node src/index.js"]
