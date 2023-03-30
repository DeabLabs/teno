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
$ docker compose up -d
$ yarn start
```

## Docker

We use Docker Compose to run required services (Redis, Chroma, etc).

## PlanetScale + Prisma

We use PlanetScale to store our data. We have a main branch and development branch.

https://www.prisma.io/docs/guides/database/using-prisma-with-planetscale

https://planetscale.com/docs/tutorials/automatic-prisma-migrations

https://planetscale.com/docs/concepts/planetscale-workflow

https://planetscale.com/docs/concepts/branching

When adding new database migrations to an existing planetscale database, you need to apply the following steps:

- Create or confirm schema changes in `prisma/schema.prisma`
  - These changes MUST be backwards compatible with the current version of Teno, and the next version of Teno
  - The database schema changes will be applied _before_ the code changes are deployed
- Find the connection string for the database `development` branch in planetscale UI
- Apply the connection string to the `DATABASE_URL` environment variable in `.env`
- Run `npm run db:push` to apply the schema changes to the database
  - repeat as many times as you wish on the development branch
- Test that the schema changes were applied correctly and work properly with Teno
  - if you need to make changes, repeat the steps above
- Create a deploy request in planetscale UI to promote the `development` branch changes to `main`
- When satisfied with the changes, deploy!

When initializing a brand new database, you need to apply the following steps:

- Create a new database in planet scale
- Create or confirm schema changes in `prisma/schema.prisma`
- Find the connection string for the database `main` branch in planetscale UI
- Apply the connection string to the `DATABASE_URL` environment variable in `.env`
- Run `npm run db:push` to apply the schema changes to the database
- Test that the schema changes were applied correctly and work properly with Teno
- Promote the `main` branch to `production` in planetscale UI

## ESM Usage

https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c
