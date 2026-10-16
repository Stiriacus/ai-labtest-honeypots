# AI Labtest Honeypots

A set of self-contained, deliberately insecure applications used as
**targets** for exercising and benchmarking AI-assisted penetration
testing. Each one is a plausible, complete product — not a checklist of
isolated bugs — so that finding something in it rewards real
reconnaissance, analysis, and tool use rather than pattern matching.

These targets are the companion to a separate AI pentest harness: you run
the tooling against them, judge how well it works, and only then point
that tooling at your own development applications. Because the point is an
honest benchmark, the targets are **not** tailored to any particular
scanner, wordlist, or expected-findings list, and this repository ships
**no solution guide or answer key** — what a target contains is for the
tester (human or AI) to discover.

## What's here

Each app lives under [`apps/`](apps/) and is **independently controlled**:
its own stack, its own `docker-compose.yml`, its own README, its own port.
You bring up only the ones you want to test.

| App | Stack | Interface | Default port |
|---|---|---|---|
| [`apps/thornwood`](apps/thornwood/) | Node.js / Express + vanilla-JS SPA | Web UI + JSON API | 3000 |
| [`apps/harrowgate`](apps/harrowgate/) | Python / FastAPI + server-rendered Jinja2 | Web UI | 8000 |
| [`apps/meridian`](apps/meridian/) | Go / chi | JSON API only | 8080 |
| [`apps/larkfield`](apps/larkfield/) | Node.js / Express + `graphql` | GraphQL API only | 4000 |

Four different stacks and four different shapes (classic web app,
server-rendered app, headless REST API, GraphQL API) so the tooling meets
genuinely different surfaces and has to reach for different techniques.

## Design principles

Every target is built to the same ideas, which is what makes them harder
to analyse than a bare vulnerable app:

- **Reconnaissance matters.** Each target has a signal-to-noise surface:
  mostly ordinary endpoints and assets, with the interesting things not
  labelled and not on the obvious path. Enumeration and source/traffic
  analysis are rewarded, guessing is not.
- **Findings chain.** Reaching the most sensitive outcome takes several
  steps, where the evidence from one step is the input to the next. That
  forces nested tool use with analysis in between, not single-shot hits.
- **More than one real path.** A target has several genuine routes to a
  sensitive outcome, not a single intended solution, so tooling has to
  prioritise and triage rather than stop at the first thing it finds. Some
  of those routes are classes that signature and crawl-based scanners
  rarely reach on their own — business-logic and workflow abuse, and bugs
  that only appear under concurrency.
- **Dead ends are real.** Some weaknesses are genuine, reportable
  findings that nonetheless lead nowhere useful. Part of the exercise is
  recognising a real bug that is *not* the way in.
- **Order is enforced.** Some steps are visibly present but blocked until
  an earlier step has been completed, so the path has to be worked out,
  not brute-forced.
- **Realistic backing.** Real data stores, plausible seed data at volume,
  machine-to-machine integrations, internal-only services, and the kind
  of leftover/legacy surface that accumulates in a real product.

The specifics of each target — which weaknesses exist and how they relate
— are intentionally left undocumented here. The per-app READMEs describe
each product and how to run it, nothing more.

## Running a target

Each app is brought up on its own. For example:

```bash
cd apps/thornwood && docker compose up --build      # http://localhost:3000
cd apps/harrowgate && docker compose up --build     # http://localhost:8000
cd apps/meridian && docker compose up --build       # http://localhost:8080
cd apps/larkfield && docker compose up --build      # http://localhost:4000/graphql
```

Each app's README also documents running it directly (without Docker) for
quick local work. Seed data is created on first boot.

## Safety and scope

These applications are intentionally vulnerable. Run them **only** in an
isolated lab.

- Every app's compose network is marked `internal` (no outbound internet
  access), and internal-only backend services are deliberately **not**
  published to the host.
- Do not expose these targets to the public internet or to any network
  you do not fully control.
- Use them only against tooling and in environments you are authorised to
  test.

## Repository layout

```
apps/
  thornwood/    Node/Express B2B wholesale portal (web UI + API)
  harrowgate/   Python/FastAPI property-management portal (server-rendered)
  meridian/     Go/chi fleet-telematics API (headless REST)
  larkfield/    Node/Express analytics platform (GraphQL)
README.md       this file
```
