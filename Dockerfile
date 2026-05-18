FROM node:22-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV="production"
ENV NEXT_TELEMETRY_DISABLED="1"

RUN corepack enable \
  && corepack prepare pnpm@10.33.2 --activate \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    fontconfig \
    imagemagick \
    libheif-examples \
    libheif1 \
    fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN mkdir -p data storage/backgrounds storage/screenshots storage/thumbnails storage/covers storage/manuscripts storage/audio storage/source-videos storage/renders storage/exports

CMD ["pnpm", "authorloom:worker"]
