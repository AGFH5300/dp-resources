# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS builder
WORKDIR /app
# NEXT_PUBLIC_* values are compiled into the browser bundle during `next build`.
# Keep public Supabase defaults here so Docker deploys still build a working client
# even when the host runtime env vars are not forwarded as Docker build args.
ARG NEXT_PUBLIC_SUPABASE_URL=https://vwreomwieplqqdrmjcuc.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6InZ3cmVvbXdpZXBscXFkcm1qY3VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTY3NzAsImV4cCI6MjA5ODQ3Mjc3MH0.u4Hm7ilIctrC5_enC2T5piifhEuIjpxCWbd7170bzu0
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6InZ3cmVvbXdpZXBscXFkcm1qY3VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTY3NzAsImV4cCI6MjA5ODQ3Mjc3MH0.u4Hm7ilIctrC5_enC2T5piifhEuIjpxCWbd7170bzu0
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public && npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=10000

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      fonts-dejavu \
      fonts-liberation \
      fontconfig \
      ca-certificates \
      poppler-utils \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/next.config.* ./

EXPOSE 10000

CMD ["sh", "-c", "npm run start -- -H 0.0.0.0 -p ${PORT:-10000}"]
