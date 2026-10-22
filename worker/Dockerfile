FROM node:24-bookworm-slim AS runtime
ARG TARGETARCH
ADD https://github.com/bbc/audiowaveform/releases/download/1.10.2/audiowaveform_1.10.2-1-12_${TARGETARCH}.deb /tmp/audiowaveform.deb
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg /tmp/audiowaveform.deb \
    && rm -rf /var/lib/apt/lists/* /tmp/audiowaveform.deb
WORKDIR /app
RUN npm install --global pnpm@10.34.7
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json
COPY worker/package.json worker/package.json
RUN pnpm install --frozen-lockfile
COPY shared/src shared/src
COPY shared/tsconfig.json shared/tsconfig.json
RUN pnpm -F @bpackz/shared build
COPY backend/src backend/src
COPY worker/src worker/src
USER node
CMD ["node", "worker/src/index.ts"]

FROM runtime AS test
COPY backend/drizzle backend/drizzle
COPY worker/test worker/test
CMD ["pnpm", "-F", "worker", "test"]

FROM runtime AS production
