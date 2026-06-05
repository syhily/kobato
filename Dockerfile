FROM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/root/.npm \
    npm ci
RUN NODE_ENV=production npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
# tini — PID 1 init for proper signal handling.
# postgresql-client — for pg_dump / pg_restore in backup jobs.
# font-noto-cjk — system fallback CJK fonts for @napi-rs/canvas.
RUN apk add --no-cache tini postgresql-client font-noto-cjk && \
    fc-cache -fv
# Only production deps (sharp + @napi-rs/canvas native bindings).
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:4321/health || exit 1
USER node
ENTRYPOINT ["tini", "--"]
CMD ["node", "./build/server/index.js"]
