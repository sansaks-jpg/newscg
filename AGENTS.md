# AGENTS.md — Development Guidelines for AI Agents (NewsCG)

This document serves as the official technical and operational guide for AI agents (Antigravity, Claude Code, Cursor, Copilot, etc.) working on the **NewsCG** repository. Every agent that modifies, maintains, or adds features must read and strictly adhere to these guidelines.

> "When a repository's documentation and its existing code disagree, follow the conventions used in the existing code, and in your final reply point out each inconsistency you found between the documentation and the code."

---

## 1. System Overview & Architecture

NewsCG is a web-native broadcast graphics system (*Character Generator* / CG) that separates the operator control interface from a transparent visual output (*alpha overlay*), inspired by the **Singular.live** architecture. The standalone output `/output` is designed to be integrated as a *Web Browser Input* in broadcast switchers such as vMix, OBS Studio, and Wirecast.

### Monorepo Structure (npm workspaces)

```
newscg/
├── apps/
│   ├── server/                 # Express 5 + SQLite backend service
│   │   ├── src/
│   │   │   ├── index.ts        # REST endpoints & SSE streaming (/api/live/stream)
│   │   │   ├── db.ts           # SQLite better-sqlite3, schema migrations, CRUD operations
│   │   │   └── live.ts         # Live state machine, command queue, idempotency, SSE pub/sub
│   │   └── tests/              # Production flow & integration tests (Vitest)
│   └── web/                    # React 19 + Vite + Tailwind CSS v4 frontend
│       ├── src/
│       │   ├── App.tsx         # Root container, internal routing & operator layout
│       │   ├── BroadcastGraphic.tsx  # Graphic render engine (Lower Third, Logo, Clock)
│       │   ├── OverlayWindow.tsx     # Standalone transparent output screen (/output)
│       │   ├── AutoSquishText.tsx    # Text safety squishing component for Safe Area
│       │   ├── BroadcastTicker.tsx   # Scrolling bottom news ticker
│       │   ├── Newsroom.tsx          # Rundown, story, and graphics management panel
│       │   ├── SimpleProductionEditor.tsx # Live broadcast operator control panel
│       │   ├── TemplatePreview.tsx   # Graphic preview monitor before airing
│       │   ├── VisualTemplatePicker.tsx # Visual template selector
│       │   └── useLayerPresence.ts   # Entry/exit layer animation transition hook
├── packages/
│   └── shared/                 # Single Source of Truth (SSOT)
│       └── src/index.ts        # Zod validation schemas, TypeScript interfaces, event types
├── docs/                       # Architectural guides and technical documentation
├── package.json                # Root workspaces definition & runner scripts
└── tsconfig.base.json          # Base TypeScript configuration
```

---

## 2. Core Development Principles & Rules

### A. Immutability (Absolute)
- Always construct new objects or arrays when updating state. Never mutate state variables or database rows in-place.
- Use spread syntax (`...state`, `...item`) or pure functional transformations (`map`, `filter`).

### B. Single Source of Truth (SSOT) in `packages/shared`
- Every data type, interface, enum, and validation schema must reside in `packages/shared/src/index.ts`.
- Runtime data validation relies on **Zod**. Both client and server must use the exact same schemas (`fieldSchemas`, `graphicInputSchema`, `rundownInputSchema`, etc.).
- Never declare conflicting local duplicate types outside `@newscg/shared`.

### C. Broadcast Operational Safety
- **Isolation**: Editing drafts in the dashboard must never modify currently on-air graphics (ON AIR / Program).
- **Idempotency**: All live broadcast commands (`TAKE`, `UPDATE`, `CLEAR`, `CLEAR_ALL`, `STAGE`, `VARIANT`) must accept or supply an `Idempotency-Key` to prevent duplicate execution from operator double-clicks.
- **Smooth Transitions**: Live content changes must support seamless in-place text updates (`UPDATE`) without restarting entry animations if the template is identical, or exit transitions (`CLEAR`) before graphics are removed.
- **Integrity of `/output`**: The standalone output screen `/output` must never be disrupted, broken, or removed, as it serves as the live video feed for broadcast switchers.

### D. Error Handling
- Never silently catch errors (*silent fail* / *empty catch*).
- Provide clear, user-friendly error messages for broadcast operators when validation fails or live status conflicts occur.
- Unmatched API routes must return a JSON 404 response, never an HTML fallback page.

---

## 3. Real-Time Event Bus & Server-Sent Events (SSE)

The overlay output (`/output`) connects to the backend via Server-Sent Events at `/api/live/stream`.

### Overlay Event Types (`OverlayEvent`)
1. **`SYNC`**: Sent when an overlay client connects or reconnects. Dispatches current live state, active graphic, field snapshots, and master state.
2. **`TAKE`**: Instructs the overlay to render a new graphic with its entrance animation.
3. **`UPDATE`**: Seamlessly updates text/data on the currently active on-air graphic without re-triggering entrance animations.
4. **`SWITCH_DETAIL`**: Smoothly toggles detail/subline expansion or contraction on the active on-air graphic.
5. **`CLEAR`**: Plays an exit transition animation for the lower third graphic while keeping the master overlay (logo/clock/ticker) active.
6. **`MASTER_UPDATE`**: Updates logo, live badge, ticker, or timezone configurations without affecting lower thirds.
7. **`CLEAR_ALL_IMMEDIATE`**: Instantly wipes all elements off-screen (emergency total blackout).
8. **`CLEAR_ALL_ANIMATED`**: Clears all screen elements with smooth exit animations.

---

## 4. Operational Commands & Testing

### Running Tests and Verifications
AI agents **must** run automated test suites and typechecks before completing tasks:

```bash
# Run automated tests (Vitest)
npm test

# Run TypeScript typechecks across workspaces
npm run typecheck

# Build all production bundles
npm run build
```

### Debugging Prohibitions
- **DO NOT** launch external browsers for testing or debugging.
- Perform all validations via terminal commands, Vitest unit tests, or terminal HTTP requests (`curl` / PowerShell).

---

## 5. Database & Persistence (SQLite)

- The SQLite database file resides at `apps/server/data/newscg.db`.
- Uses the high-performance `better-sqlite3` driver with **Write-Ahead Logging (WAL)** and foreign keys enabled.
- **WARNING**: Database files (`*.db`, `*.db-shm`, and `*.db-wal`) are listed in `.gitignore`. Never commit binary database files to Git.

---

## 6. Broadcast Graphic Safe Area & Visual Specifications

- Standard canvas resolution: `1920 x 1080` (Full HD).
- Canvas background must remain completely transparent (`background: transparent`).
- All lower third elements are positioned for broadcast safe display (templates anchor to `bottom: 30px` - `40px` with left margin for branding bugs). While outer bounding boxes align to modern 16:9 broadcast graphics positioning, dynamic headline, subline, and speaker text must utilize the `AutoSquishText` component to prevent text overflow when character counts are high.
- `AutoSquishText` supports variable compression clamping down to `minScale: 0.1` (or specified prop value) via horizontal CSS scaling (`transform: scaleX(s)`) to maintain layout stability without clipping.

---

## 7. Ingesting User-Submitted Rundowns

- Refer to [docs/AI_RUNDOWN_GUIDE.md](docs/AI_RUNDOWN_GUIDE.md) whenever a user provides a news rundown to add to the system.
- Preserve source story order and factual accuracy, validate with shared schemas, write through the REST API, and perform a readback.
- New materials are stored as editable drafts without approval state gates (Draft/Ready/Needs Review). Importing a rundown does not grant permission to modify master settings or trigger ON AIR commands.
- For direct HTTP interactions, begin at `GET /api/agent` and consult [docs/AI_AGENT_API.md](docs/AI_AGENT_API.md). Use published schemas and read back results after every mutation.
- Graphic types and opening headlines are documented in [docs/CG_GUIDE.md](docs/CG_GUIDE.md) and available at `GET /api/agent/cg-guide.md`. The `headline-bulletin` preset is listed in discovery `graphicPresets`; it uses the `HEADLINE` template. Edit headlines via PATCH graphic, edition metadata via PATCH rundown, and story titles via PATCH item. Keep these three entities separate, read back each, and never apply to Program without live instructions.
- The HIGHLIGHT label uses the topic tab above the headline via `kicker` and `showKicker`, along with the T toggle. Do not reintroduce side panels. `headlineLabel` is deprecated and kept only for backward compatibility; new materials must use topic fields. On Liputan7, the topic tab uses template visuals (burgundy–ivory with sand line, left-aligned above panel). Interactive HIGHLIGHT examples are available in `/templates/liputan7` and `/templates/cnn`.
- Operator shortcuts: in Production:
  - `Space` / `Enter`: execute primary live action (`TAKE` or `UPDATE`).
  - `→` / `←`: trigger TAKE/UPDATE and OUT on regular cues; when Preview displays a HIGHLIGHT cue, `→`/`←` navigate between highlight headlines (without triggering live commands).
  - `Esc` / `C`: execute `CLEAR` (OUT) for the active lower-third graphic.
  - `U`: execute live in-place `UPDATE`.
  - `P`: stage default News Anchor in Preview.
  - `O`: stage default Field Reporter in Preview.
  - `H`: stage Headline preset.
  - `K`: stage SOT preset; `PageUp` / `PageDown`: select previous / next SOT soundbites.
  - `L`: toggle Location bug in draft/preview.
  - `T`: toggle Topic/kicker tab in draft/preview.
  - `D`: toggle Detail / subline bar in draft/preview.
  - `M`: commit staged Master overlay changes to Program.
  - `1`: toggle Master Logo layer (or Program Logo on Liputan7).
  - `2`: toggle Master Live badge / Jam.
  - `3`: toggle Master Ticker (BCC / Liputan7).
  - `0`: toggle **Master Out / Master In** (mutes or restores all active master layers on Program).
  - Note: Blackout `ALL OUT` (animasi/seketika) is triggered via explicit UI button or live API command (`POST /api/live/clear-all`), distinct from key `0` which controls master layers.
- Field reporter defaults are stored in `reporter_defaults` settings (`name`, default `role: "Reporter Lapangan"`, `location`) and triggered via hotkey `O` in Production. `O` only stages Preview; TAKE/UPDATE requires explicit live commands. The `GET/PATCH /api/settings/reporter-defaults` and `POST /api/live/reporter` endpoints follow shared schemas, queues, and idempotency keys. Do not create rundown cues just because the operator uses `O`; see [docs/REPORTER_LAPANGAN_DEFAULT.md](docs/REPORTER_LAPANGAN_DEFAULT.md).
- When receiving a rundown in PDF, Excel/XLSX/CSV, documents, images, chat, or other formats, agents must inquire whether the user would like a news ticker created, unless the user gave explicit instructions. Clear sections of the rundown may be imported while awaiting a reply.
- Ticker on **CNN** and **Liputan7** templates is **per-rundown** material, tied to the rundown's identity and broadcast schedule; ticker news does not need to duplicate rundown stories. Do not reuse tickers from other rundowns or fill the master ticker instead of per-rundown storage. Meanwhile, on the **BCC News** template, the ticker is **GLOBAL** on the master overlay (`tickerText` & `tickerSpeed`), applying to all broadcasts without being bound to a rundown.
- If a ticker is requested, agents must conduct web research for news on **D-2 and D-1 relative to the broadcast date in the rundown schedule**, not today's date or the import date. Confirm broadcast date and timezone before researching. Write concise headlines based on retrieved sources, including URLs and publication dates in the companion report. Never fabricate news if dates are in the future or sources are unavailable.
- Save schedules in `broadcastSchedule` and ticker content in `ticker` on the rundown via POST/import or PATCH rundown, then read back. Research sources are saved in `ticker.sources`; `ticker.forDate` must match the broadcast date. Applying a ticker snapshot uses `POST /api/live/ticker` with the rundown ID and Idempotency-Key, or by taking a cue from that rundown, only under live instruction. `PATCH /api/live/master` rejects ticker text for non-BCC templates; cue-level tickers are no longer used by overlay output. See [docs/AI_RUNDOWN_GUIDE.md](docs/AI_RUNDOWN_GUIDE.md).
- For researched tickers, agents must use `ticker.speedMode: "auto"`. The server computes `ticker.speed` using the shared formula: `round(min_i(clamp(85 - 15D_i - 10L_i - 5P_i, 70, 85)))`, where D is the proportion of words containing digits, L is the proportion of words with >10 letters, and P is the complex punctuation count per word (max 1). See [docs/AI_AGENT_API.md](docs/AI_AGENT_API.md). Do not speed up simply because headlines are long; manual mode is reserved for explicit operator instruction. Read back speed per rundown; PATCH master only accepts tickerSpeed on the BCC News template.

---

## 8. External AI Agent Integration Guide (API & Inter-Agent Communication)

This document is accessible to external AI agents via HTTP:
- **`GET /api/agent/AGENTS.md`** (or aliases `GET /api/AGENTS.md`, `/AGENTS.md`)
- **`GET /api/agent`** — Primary entry point (*Service Discovery*) returning a JSON catalog of operations, request/response schemas, character limits, and documentation links.
- **`GET /api/agent/openapi.json`** — Complete OpenAPI 3.1 specification.
- **`GET /api/agent/guide.md`** — Comprehensive REST API guide for material manipulation.
- **`GET /api/agent/rundown-guide.md`** — Guide for converting rundown files (PDF/Excel/Word/Chat) into NewsCG schema.
- **`GET /api/agent/cg-guide.md`** — Guide on CG types (HEADLINE, SOT, REPORTER, BREAKING) and visual variants.

### Adding Rundowns via API

External AI agents can create a new broadcast rundown using HTTP `POST /api/rundowns` with a UTF-8 JSON payload:

```bash
curl -X POST https://freemusic.duckdns.org/api/rundowns \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "programName": "BCC NEWS UTAMA",
    "title": "Evening Edition - October 24, 2026",
    "broadcastSchedule": {
      "date": "2026-10-24",
      "time": "18:00",
      "timezone": "WIB"
    },
    "ticker": {
      "text": "TOP HEADLINES TODAY • NATIONAL ECONOMIC UPDATE • COMPLETE COVERAGE ON BCC NEWS",
      "forDate": "2026-10-24",
      "speedMode": "auto",
      "sources": []
    },
    "items": [
      {
        "slug": "HL-01",
        "title": "Highlight: Global Economic Forum Opens",
        "format": "PKG",
        "cgRequired": true,
        "estimatedDurationSeconds": 180,
        "sortOrder": 0,
        "graphics": [
          {
            "templateType": "HEADLINE",
            "sortOrder": 0,
            "draftFields": {
              "headline": "GLOBAL ECONOMIC FORUM OPENS TODAY",
              "subline": "Hundreds of Delegates Discuss Investment Cooperation",
              "kicker": "HIGHLIGHT",
              "showKicker": "true",
              "contentMode": "headline",
              "layoutStyle": "single",
              "location": "JAKARTA",
              "showLocation": "true",
              "showDetail": "true"
            }
          }
        ]
      },
      {
        "slug": "SOT-01",
        "title": "Interview: Remarks by Finance Minister",
        "format": "SOT",
        "cgRequired": true,
        "estimatedDurationSeconds": 120,
        "sortOrder": 1,
        "graphics": [
          {
            "templateType": "SOT",
            "sortOrder": 0,
            "draftFields": {
              "headline": "ECONOMIC GROWTH OPTIMISM",
              "name": "SRI MULYANI INDRAWATI",
              "role": "Minister of Finance",
              "location": "JAKARTA",
              "showLocation": "true"
            }
          }
        ]
      }
    ]
  }'
```

### Communication Rules & Material Lifecycle
1. **Always Perform Readback**: After executing `POST /api/rundowns` or `PATCH /api/rundowns/{id}`, perform a `GET /api/rundowns/{id}` to verify stored data and ensure cue IDs and ordering match expectations.
2. **Program Isolation (ON AIR)**: Agents modifying or creating rundowns only change database drafts. This content **NEVER** automatically airs to the broadcast screen (Program) without explicit TAKE/UPDATE action from the broadcast operator.
3. **BCC Template & Ticker**: In the BCC News template (`broadcastTemplate === "bcc"`), the ticker runs globally (`master.tickerText`). Agents or broadcast control can update the BCC global ticker directly via `PATCH /api/live/master`:
   ```bash
   curl -X PATCH https://freemusic.duckdns.org/api/live/master \
     -H "Content-Type: application/json; charset=utf-8" \
     -d '\''{"broadcastTemplate": "bcc", "tickerText": "BREAKING NEWS BCC • LIVE BROADCAST FROM MAIN STUDIO", "tickerSpeed": 85}'\''
   ```
   This ticker text activates immediately on the BCC broadcast overlay without modifying active on-air lower thirds.

---

## 9. WebMCP (Web Model Context Protocol) In-Browser Agent Protocol

In addition to backend REST endpoints and SSE streams, NewsCG provides native **WebMCP** integration in the operator frontend (`apps/web/src/webMcp.ts`), mounted into the React lifecycle via `App.tsx`.

- **Standard Alignment**: Implements the emerging W3C / Chrome Web Model Context Protocol (`document.modelContext` / `navigator.modelContext`) and registers an accessible polyfill provider at `window.modelContext`.
- **Readiness Announcement**: Dispatches a `webmcp:ready` custom event on `window` upon mounting.
- **Available Tools**:
  1. `take_graphic`: Air standby graphic to Program ON AIR (`POST /api/live/take`).
  2. `update_live_graphic`: Update on-air text seamlessly without restarting entrance animation (`PATCH /api/graphics/{id}` + `POST /api/live/update`).
  3. `clear_graphic`: Exit lower-third graphic from broadcast with smooth animation (`POST /api/live/clear`).
  4. `clear_all_blackout`: Emergency full screen wipe / blackout (`POST /api/live/clear-all`).
  5. `update_master_overlay`: Update master branding, logo, clock, ticker, and broadcast template.
  6. `take_news_anchor`: Air default news anchor lower-third (`POST /api/live/news-anchor`).
  7. `take_field_reporter`: Air default field reporter lower-third (`POST /api/live/reporter`).
  8. `create_rundown`: Create a complete news rundown with stories and CG cues (`POST /api/rundowns`).
  9. `get_broadcast_status`: Read live on-air state, master overlay, and rundown summaries.

