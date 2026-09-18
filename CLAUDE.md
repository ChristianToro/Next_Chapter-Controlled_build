# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A single-page marketing/landing site for a NY Residential Property Compliance Specialist. The frontend is three flat files at the repo root — there is no build step, package manager, bundler, framework, or test suite:

- `index.html` — all page markup and content, in document order: header/nav, hero, bio section (`#bio`), services section (`#services`), coverage-area map section (`#coverage`), CTA section, footer, and the (initially `hidden`) contact modal at the bottom of `<body>`.
- `styles.css` — single stylesheet, organized in the same top-to-bottom order as the HTML sections, using CSS custom properties defined on `:root` for colors/spacing. One responsive breakpoint at `max-width: 760px` near the end of the file.
- `app.js` — vanilla JS wrapped in a single IIFE, no modules/imports. No dependencies, no plugins, no external libraries — keep it that way; any new interactivity must stay hand-rolled vanilla JS.

`server/` is a separate deployable Node/Express + SQLite API (its own `package.json`) that the consultation form POSTs to — see `BACKEND.md` for the full design. It's optional to run: opening `index.html` directly still works for everything except the form actually saving anywhere.

## Running / previewing

There is no dev server or build command. Open `index.html` directly in a browser, or serve the directory with any static file server, e.g.:

```
python3 -m http.server
```

To sanity-check syntax without a browser:

```
node -c app.js
python3 -c "import html.parser; html.parser.HTMLParser().feed(open('index.html').read())"
```

## Architecture notes

- **Coverage area is a region-button switcher, not a real map.** The `#coverage` section pairs a `.region-buttons` list of native `<button class="region-button" data-region="...">` elements (`nyc`, `westchester`, `long-island`) with a decorative (non-geographic) SVG line pattern and a `.region-detail` card (`#mapPanel`). `app.js` keys a `coverageData` object by the same `data-region` values, holding `name`, `title`, `detail`, and `services` text rendered into the card on click via `updateRegion`/`renderRegion`. Adding or renaming a region requires updating both the button's `data-region` attribute and the matching key in `coverageData` — they will silently no-op if they drift out of sync. The three `.map-location` labels (Hudson/Long Island/Westchester) are purely decorative dots at fixed CSS positions, not selectable and not geographically precise.
- **Modal is a single reusable overlay**, not per-button markup. Any element with `data-open-modal` opens `#modalOverlay` (currently the nav button, hero CTA, and bottom CTA button). Close paths: `#modalClose` click, backdrop click, and `Escape` — all handled in `app.js`, along with focus return to the triggering element.
- **Form validation is client-side first, then re-checked server-side.** `consultForm` in `app.js` validates `fullName`, `email`, `propertyAddress`, and `message` as required (plus an email-format regex), writes errors into the paired `#err-<fieldId>` span, then POSTs to `/api/consultation-requests` (see `server/routes/consultations.js`) on `submit`. The server duplicates the same required-field/email/borough checks in `server/validate.js` — client JS is trivially bypassable, so nothing trusts it alone — and responds `400` with an `errors` object keyed by the same `#err-<fieldId>` IDs, which `app.js` feeds straight into `setFieldError()`. On `201`, `app.js` reveals `#formSuccess` and resets the form after a timeout. A hidden `website` field is a spam honeypot: a non-empty value makes the server silently no-op (`204`) instead of erroring.
