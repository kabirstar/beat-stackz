FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@10.34.7
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json shared/package.json
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
COPY worker/package.json worker/package.json
RUN pnpm install --frozen-lockfile

COPY shared/src shared/src
COPY shared/tsconfig.json shared/tsconfig.json
RUN pnpm -F @bpackz/shared build

COPY frontend frontend
ARG VITE_MOCK=false
ARG VITE_API_ORIGIN=http://localhost:4000
ENV VITE_MOCK=${VITE_MOCK}
ENV VITE_API_ORIGIN=${VITE_API_ORIGIN}
RUN pnpm -F web build

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
