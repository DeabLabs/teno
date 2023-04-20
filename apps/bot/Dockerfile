FROM node:18-slim AS builder
# Set working directory
WORKDIR /app
RUN yarn global add turbo
COPY . .
RUN turbo prune --scope=bot --docker

FROM node:18-slim AS installer

RUN apt-get update
RUN apt-get install -y python3 make automake libtool-bin autoconf g++ openssl libssl-dev ca-certificates
RUN update-ca-certificates
WORKDIR /app

# First install the dependencies (as they change less often)
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/yarn.lock ./yarn.lock
RUN yarn install

# Build the project
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json
RUN yarn turbo run build --force --filter=bot...

FROM node:18-slim as runner
ARG DATABASE_URL
ARG REDIS_URL
ARG OPENAI_API_KEY
ARG ELEVENLABS_API_KEY
ARG DEEPGRAM
ARG TOKEN

RUN apt-get update
RUN apt-get install -y ffmpeg

WORKDIR /app
COPY --from=installer /app/apps/bot/dist/* .
COPY --from=installer /app/apps/bot/package.json .
COPY --from=installer /app/node_modules/ /app/node_modules/
COPY --from=installer /app/packages/ /app/packages/
COPY --from=installer /etc/ssl/certs /etc/ssl/certs

CMD ["node", "bot.js"]