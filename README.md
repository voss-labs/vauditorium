# Welcome to React Router!

A modern, production-ready template for building full-stack React applications using React Router.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/remix-run/react-router-templates/tree/main/default)

## Features

- 🚀 Server-side rendering
- ⚡️ Hot Module Replacement (HMR)
- 📦 Asset bundling and optimization
- 🔄 Data loading and mutations
- 🔒 TypeScript by default
- 🎉 TailwindCSS for styling
- 📖 [React Router docs](https://reactrouter.com/)

## Getting Started

### Installation

Install the dependencies:

```bash
npm install
```

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## Backend

Server code lives in `app/.server/` (never bundled for the browser) and runs in
React Router loaders and actions, deployed serverless. Data is Postgres:
[Neon](https://neon.com) in production, through [Drizzle ORM](https://orm.drizzle.team).

### Local database

No Docker or Postgres install needed. The default runs Postgres in-process with
[PGlite](https://pglite.dev), stored in `./.pglite`:

```bash
cp .env.example .env
npm run db:migrate   # create the tables
npm run db:seed      # demo events, applications with documents, a suggestion
npm run dev
```

Only one process can open the PGlite folder at a time, so stop `npm run dev`
before running `db:seed` or `db:studio`. Uploaded documents are stored in
`./.uploads` locally and in a private R2 bucket in production. To use a Postgres you run yourself, or
Neon, change `DATABASE_URL` in `.env` (examples in `.env.example`).

### Schema changes

Edit the tables in `app/.server/db/schema/`, then:

```bash
npm run db:generate   # writes a SQL migration to app/.server/db/migrations
npm run db:migrate    # applies it
```

Commit the generated migration with the schema change. Deploys run migrations
in CI before shipping; see [docs/deploys.md](docs/deploys.md). How uploaded
documents are stored: [docs/documents.md](docs/documents.md).

| Table                   | Holds                                                       |
| ----------------------- | ----------------------------------------------------------- |
| `events`                | The public calendar. Any slots 07:00–19:00, never overlapping |
| `applications`          | Booking requests, from submission to approval or decline.   |
| `application_documents` | Permission letters and documents attached to an application |
| `application_messages`  | The approval trail: queries, document requests, decisions   |
| `suggestions`           | The public suggestion box                                   |

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

### Docker Deployment

To build and run using Docker:

```bash
docker build -t my-app .

# Run the container
docker run -p 3000:3000 my-app
```

The containerized application can be deployed to any platform that supports Docker, including:

- AWS ECS
- Google Cloud Run
- Azure Container Apps
- Digital Ocean App Platform
- Fly.io
- Railway

### DIY Deployment

If you're familiar with deploying Node applications, the built-in app server is production-ready.

Make sure to deploy the output of `npm run build`

```
├── package.json
├── package-lock.json (or pnpm-lock.yaml, or bun.lockb)
├── build/
│   ├── client/    # Static assets
│   └── server/    # Server-side code
```

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever CSS framework you prefer.

---

Built with ❤️ using React Router.
