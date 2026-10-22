FROM node:24-bookworm-slim
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
