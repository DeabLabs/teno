FROM node:18-slim AS installer

RUN apt-get update
RUN apt-get install -y ffmpeg python3 make g++ openssl libssl-dev ca-certificates
RUN update-ca-certificates
WORKDIR /app

COPY . .
RUN yarn install
RUN yarn build

FROM node:18-slim as runner
ARG DATABASE_URL
ARG REDIS_URL
ARG OPENAI_API_KEY
ARG ELEVENLABS_API_KEY
ARG DEEPGRAM
ARG TOKEN
EXPOSE 45000-60000

WORKDIR /app
COPY --from=installer /app/dist/* .
COPY --from=installer /app/package.json .
COPY --from=installer /app/node_modules/ /app/node_modules/
COPY --from=installer /etc/ssl/certs /etc/ssl/certs
# COPY --from=installer /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

CMD ["node", "bot.js"]