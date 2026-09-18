# Northline Compliance — Marketing Site

A single-page marketing site for a NY Residential Property Compliance Specialist, with a small backend API for capturing consultation requests.

## Features

- **Hero, bio, and services sections** introducing the specialist and the compliance services offered.
- **Coverage area switcher** (`#coverage`) — buttons for NYC, Westchester, and Long Island swap the details shown in a card; backed by a decorative (non-geographic) map graphic, not an interactive map.
- **Consultation request modal** — a reusable overlay opened from the nav, hero, and bottom CTA buttons. Closes via the × button, backdrop click, or `Escape`, and returns focus to whatever triggered it.
- **Consultation form** (`consultForm`) — collects name, email, phone, property address, borough/county, and message.
  - Client-side validation with inline error messages.
  - Server-side validation that mirrors the client rules, so the API is safe even if called directly.
  - A hidden honeypot field to filter out basic spam bots.
  - Submissions are stored in a SQLite database via the API in `server/`.

## Project structure

```
index.html      Page markup (frontend)
styles.css      Stylesheet (frontend)
app.js          Vanilla JS behavior: modal, coverage switcher, form validation/submission (frontend)
server/         Express + SQLite API that the consultation form submits to (backend)
BACKEND.md      Design notes for the backend
CLAUDE.md       Guidance for AI-assisted development in this repo
```

The frontend (`index.html` / `styles.css` / `app.js`) is a static, build-free, dependency-free site — it has no compile step and needs nothing installed to view. The backend in `server/` is a separate, optional Node process with its own dependencies; the frontend still opens and displays correctly without it, but the consultation form won't save anywhere until it's running.

## Running the frontend

No build step or dev server is required. Either:

- Open `index.html` directly in a browser, or
- Serve the directory with any static file server, e.g.:

```
python3 -m http.server
```

Both are fine for working on markup, styles, and behavior, but the consultation form won't submit from either — it posts same-origin, and neither a `file://` page nor a plain static server has an API behind it. To exercise the form, run the backend and use the page it serves (see below).

To sanity-check the frontend files without a browser:

```
node -c app.js
python3 -c "import html.parser; html.parser.HTMLParser().feed(open('index.html').read())"
```

## Running the backend (consultation API)

The API stores consultation requests in a local SQLite file so the form has somewhere real to submit to.

1. Install dependencies:
   ```
   cd server
   npm install
   ```
2. Copy the example environment file and adjust as needed:
   ```
   cp .env.example .env
   ```
   - `DATABASE_PATH` — where the SQLite file is created (a relative path is fine for local dev).
   - `ALLOWED_ORIGIN` — leave unset locally to skip CORS restriction; set to your production domain when deployed.
   - `PORT` — defaults to `3001`.
3. Start the server:
   ```
   npm start
   ```
   The first run creates `server/data/consultations.db` and applies the schema automatically.
4. Smoke test without touching the UI:
   ```
   curl -X POST http://localhost:3001/api/consultation-requests \
     -H "Content-Type: application/json" \
     -d '{"fullName":"Test","email":"test@example.com","propertyAddress":"1 Test St","message":"hi","website":""}'
   ```
5. To test the form itself, open `http://localhost:3001` and use the page served by this server. It serves `index.html`, `styles.css`, `app.js`, and `assets/` alongside `/api`, so the form's same-origin POST reaches the API with no CORS setup and no change to `API_BASE` in `app.js`.

See [BACKEND.md](BACKEND.md) for the full API contract, data model, and security notes (rate limiting, honeypot, server-side validation, CORS, PII handling).

## Running via WSL

If you're developing on Windows with WSL2, keep VS Code and all commands inside the WSL shell rather than Windows `cmd.exe`/PowerShell — a Windows terminal can't handle the project's UNC path (`\\wsl.localhost\Ubuntu\...`) as a working directory and will silently run the wrong Node install against the wrong directory.

- In VS Code: `Ctrl+Shift+P` → **WSL: Reopen Folder in WSL** (requires the WSL extension), or at minimum set the integrated terminal's default profile to your WSL distro (`Ctrl+Shift+P` → **Terminal: Select Default Profile**).
- `better-sqlite3` in `server/` is a native module. If `npm install` fails while compiling it (e.g. `make: g++: No such file or directory`), install a C++ toolchain in WSL: `sudo apt-get install -y g++`.

Once you're in a real WSL shell, one process serves both the site and the API — the Express server in `server/` serves `index.html`, `styles.css`, `app.js`, and `assets/` alongside `/api`:

```
# From server/
npm start
```

WSL2 automatically forwards `localhost` ports to Windows, so open `http://localhost:3001` in your regular Windows browser — no UNC paths or WSL-specific browser needed.

Don't serve the frontend from a second static server (e.g. `python3 -m http.server 8080`) while testing the form. `app.js` posts to `/api/consultation-requests` **same-origin**, so a page loaded from `localhost:8080` posts to `localhost:8080`, where a static file server answers `POST` with `501` and the form reports *"Something went wrong submitting your request."* A plain static server is still fine for frontend-only work where the form doesn't need to submit.
