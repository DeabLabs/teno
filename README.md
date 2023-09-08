# 📝 Teno

Teno is a Discord bot that records voice channels and saves them as transcribed text files.

## Usage

```sh-session
# Clone teno, and then inside the directory:
$ npm i -g yarn
$ yarn
$ yarn build

# Set up tokens (see .env.example)
$ cp .env.example .env
$ code .env

# Start the bot!
$ yarn start
```

## Docker

We used to use Docker Compose to run required services (Redis, Database, etc).

We now host our services on the cloud:

- Redis with https://upstash.com
- Database with https://supabase.com/

We may still deploy Teno to a Docker container in the future, but the services will probably
stay third party.

## Supabase

We use supabase to store our database data, and prisma to manage it.

## Upstash

We use Upstash to store our Redis data.
We simply connect to it with the `REDIS_URL` environment variable stuffed into ioredis.

## ESM Usage

https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c
