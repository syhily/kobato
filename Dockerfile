FROM node:25-alpine AS build
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/root/.npm \
    npm ci
RUN NODE_ENV=production npm run build

FROM node:25-alpine AS runtime
WORKDIR /app
ENV NPM_CONFIG_LEGACY_PEER_DEPS=true
RUN apk add --no-cache postgresql-client
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321
CMD ["npm", "run", "start"]
