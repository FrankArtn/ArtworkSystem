This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.



🔹 Stack & Hosting

Framework: Next.js 15 (App Router, Turbopack, React 19, Node 20+).

Hosting: Render Web Service (Singapore).

Database: Turso (libSQL) via @libsql/client (env: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN).

Render build commands:

Build: npm ci && npm run build

Start: npm run db:migrate && npm start

Health path: /api/health.




##Used Node.js to run JavaScript outside the browser, so can run from terminal
Node.js = the runtime that executes JavaScript outside the browser (on a server or your dev machine).

Used Vercel to deploy


Executes your server-side code (Next.js API routes like /api/materials, DB calls to Turso).

Powers the server process on Render.


##Frontend and Backend: Use Next.js for web framework 
Next.js = a web framework built on top of React + Node.js that gives you routing, server rendering, API routes, bundling, etc.
Next.js

Organizes your app with file-based routing (app/materials/page.js, app/api/materials/route.js).

Renders React pages on the server or client (App Router, Server Components).

Handles assets, builds, and optimizations.

Next.js relies on Node.js to run


##Database: Turso (libSQL)
Turso (libSQL) remote SQLite; accessed over HTTP with @libsql/client.

Schema created by scripts/init-db.mjs:

materials, products, bom, quotes, quote_items, orders.

Env vars:

TURSO_DATABASE_URL, TURSO_AUTH_TOKEN (in .env.local for dev; in Render for prod).

##Config & Build
package.json:

dev: next dev (you may keep --turbopack locally).

build: next build (no Turbopack for Render).

start: next start.

db:init: node scripts/init-db.mjs.

Node 20 pinned via "engines": { "node": "20.x" }


##Deployment: Render
Render Web Service (region: Singapore).

Auto-deploys from GitHub’s main.

No disk needed (DB is external on Turso).

Production env vars set in Render.

The Artwork System (Next.js) is hosted on Render (Singapore region), and it uses a Turso (libSQL) database.

##Migration to Postgres or SQlite ready if an upgrade is needed.
Just need to change 'DB_PROVIDER= [new provider]' in the .env.local file
providers script is also ready in lib/providers
employed one db access point in db.js in lib/ from the get go so that all db  queries use the getdb() method.
In the future if db is changed will only need to change the hardcoded provider in getdb()
