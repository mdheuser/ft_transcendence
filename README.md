# ft_transcendence — Full-stack Pong platform (TypeScript, Fastify, SQLite, Docker)

A containerized Pong web platform built as a team capstone in the 42 Network curriculum (Hive Helsinki). The project combines a TypeScript single-page app with a Fastify (TypeScript) backend, persistent SQLite storage, and an Nginx reverse-proxy setup.

This repository is intentionally “skills-forward”: authentication, data integrity, safe serialization, REST API contracts, persistent match history, and dashboards that turn raw events into user-facing stats.

## Authors

<div>
  <a href="https://github.com/CBOcoding"><img src="https://github.com/CBOcoding.png" width="50"/></a>
  <a href="https://github.com/Gabriscript"><img src="https://github.com/Gabriscript.png" width="50"/></a>
  <a href="https://github.com/xith13n"><img src="https://github.com/xith13n.png" width="50"/></a>
  <a href="https://github.com/mdheuser"><img src="https://github.com/mdheuser.png" width="50"/></a>
</div>

My primary ownership areas were user management and stats dashboards.

## Demo

Live: TODO  
Screenshots / short video: TODO

## What the app does

- Browser Pong gameplay, including a single-player mode vs AI and a tournament flow.
- Accounts, authentication, profile management, and avatar handling.
- Friend system and user discovery surfaces.
- Match persistence and match history.
- Stats dashboards (user/game views built from recorded matches).

## Tech stack

Frontend
- TypeScript SPA (custom routing / view modules)
- Tailwind CSS + custom CSS where needed
- Rollup build pipeline

Backend
- Node.js + Fastify (TypeScript)
- SQLite (persistent data)
- Explicit schema + performance-minded indexing for match history queries

Infra
- Docker Compose multi-container environment
- Nginx reverse proxy / static delivery

## What I personally owned

My main ownership areas were **Standard User Management** and **User/Game Stats Dashboards**.

In practice, that meant building the parts that usually fail first in real products:

- Safe “public user” serialization (defensive shaping of responses to prevent sensitive-field leakage).
- Data integrity rules (for example: unique username enforcement across register and profile updates).
- Robust partial updates (PATCH semantics for `/users/me`, supporting username-only or email-only updates cleanly).
- Test hardening (extended bash regression scripts to cover edge cases and fixed token passing in GET requests).
- Stats and match history plumbing (turning match records into reliable profile/dashboard data).

## Repository layout

- `frontend/` — TypeScript SPA: pages, UI modules, game loop, API client layer
- `backend/` — Fastify API: routes/services, SQLite integration, schema, scripts
- `nginx/` — reverse proxy and static delivery configuration
- `docker-compose.yml` — orchestration for local development

## Run locally (Docker + Makefile)

This project is run via Docker Compose, wrapped by a Makefile.

### Prerequisites
- Docker
- Docker Compose
- make

### Start
```bash
make up
```

The app will be available at:
```bash
https://localhost:8443
```

Tip: to see the full command list with descriptions:

```bash
make help
```

## Database and performance notes

SQLite is initialized from a schema file and runs idempotently (safe to re-run on startup). Match history queries are supported by indexes so history/stats endpoints don’t degrade as data grows.

## Security notes

- User data is sanitized before being returned publicly (only “safe” fields leave the backend).
- Private endpoints require authentication; public endpoints return only safe representations.
- The goal is not “it works”, but “it works without leaking”.



