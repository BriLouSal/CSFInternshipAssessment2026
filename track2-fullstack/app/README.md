# FarmTracker

A livestock record management application for tracking animals, paddock assignments, and health events.

## Requirements

- Node.js 22.5+ (uses built-in `node:sqlite`)

## Setup

```bash
cd track2-fullstack/app/backend
npm install
node seed.js
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Running tests

The test suite starts its own server and temporary SQLite database:

```bash
cd backend
npm test
```

## Project structure

```
app/
├── backend/
│   ├── server.js          # Express app entry point
│   ├── db.js              # Database connection and schema
│   ├── routes/
│   │   ├── animals.js     # Animal endpoints
│   │   └── paddocks.js    # Paddock endpoints
│   ├── test/
│   │   └── api.test.js    # Integration tests
│   ├── seed.js            # Seed script (run once after install)
│   └── package.json
└── frontend/
    ├── index.html         # Paddocks overview
    ├── animals.html       # Animal list
    ├── animal-detail.html # Animal detail and health events
    ├── app.js             # Shared fetch utilities
    └── styles.css
```

## API reference

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/paddocks | List all paddocks |
| POST | /api/paddocks | Create a paddock |
| GET | /api/paddocks/:id | Get a paddock |
| GET | /api/animals | List animals (`page`, `limit` query params) |
| POST | /api/animals | Create an animal |
| GET | /api/animals/:id | Get an animal |
| PUT | /api/animals/:id | Update an animal |
| DELETE | /api/animals/:id | Delete an animal |
| GET | /api/animals/:id/health-events | List health events |
| POST | /api/animals/:id/health-events | Log a health event |
