# Multi-stage build for the 2v2 Basketball Championship app.
# Works on Raspberry Pi (arm64/armv7) and regular x86 machines.

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/data.db
WORKDIR /app

# Copy installed deps and build output.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/package.json ./package.json

# Persist the SQLite database outside the image.
VOLUME ["/data"]
RUN mkdir -p /data

EXPOSE 3000
CMD ["npm", "start"]
