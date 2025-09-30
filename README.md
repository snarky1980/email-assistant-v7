<div align="center">
  <h1>Email Assistant v7 (Transition from v6)</h1>
  <p>Template & variable manager + AI enhancement layer with a secure OpenAI proxy.</p>
  <p>
    <a href="https://snarky1980.github.io/email-assistant-v7/"><img alt="GitHub Pages" src="https://img.shields.io/badge/site-live-green?style=flat-square"></a>
    <a href="https://github.com/snarky1980/email-assistant-v7/releases/tag/v1.5.3"><img alt="Version" src="https://img.shields.io/badge/version-v1.5.3-teal?style=flat-square"></a>
    <img alt="Status" src="https://img.shields.io/badge/status-active-success?style=flat-square">
    <img alt="Language" src="https://img.shields.io/badge/i18n-FR%20%7C%20EN-blue?style=flat-square">
  </p>
  <sub><code>var-popup-integrated.js</code> v1.5.3 (magnetic snap + bilingual docs)</sub>
</div>

---

## 1. Overview
This project combines:
1. A template & variable management workspace (with admin endpoints & studio UI)
2. A floating, draggable, resizable Variables popup (non-destructive DOM transformation)
3. An inline AI assistant (secure server proxy to OpenAI; API key never exposed)

The popup replaces the original in-page collapsible variable section. It preserves full reactivity by moving (not cloning) the underlying DOM. Position, size and open state persist via `localStorage`.

---
## 2. Key Features
Template / Variable Management:
- CRUD for templates & categories (`/api/admin/*`)
- Variable extraction supports accented tokens: `<<NuméroProjet>>` and legacy `{{variable}}`
- Import / Export JSON endpoint (`/api/admin/export`, `/api/admin/import`)
- Soft delete (archiving) + restore for templates

Variables Popup (v1.5.0):
- Draggable, single bottom-right resize handle (teal)
- Auto-fit button (sizes to content within viewport)
- Minimize / restore, close (state persisted)
- Internal scroll with sticky header + custom scrollbar
- Does NOT auto-open for first‑time visitors (opens only after explicit user action)
- Robust detection (interval + mutation observer + rescue heuristic) for late-render environments (e.g. VS Code Simple Browser)

AI Assistant:
- Live sync of email body (no manual sync needed)
- Actions: Polish, Correct, Simplify, Translate (EN ↔ FR), Custom instruction
- Instruction augmentation field
- Secure proxy endpoint: `/api/openai` (browser never receives your OpenAI key)

Security & Admin:
- Bearer token protection for all `/api/admin/*` routes
- Multiple admin tokens (primary + rotating secondary)
- Token rotation & generation helpers (`npm run set-admin-token`)
- Optional public (sanitized) template listing with `PUBLIC_TEMPLATES=1`

UX Safeguards:
- Custom themed confirmation modal for destructive reset (replaces native confirm)
- Version badge removed for production (was used only for browser mismatch debugging)

---
## 3. Quick Start (Local)
```bash
git clone <repo>
cd email-assistant-v6-2
npm install
cp .env.example .env
vi .env   # set OPENAI_API_KEY=sk-...
npm start
```
Open: http://localhost:3000

Optional: Generate an admin token automatically
```bash
npm run set-admin-token
# Then visit http://localhost:3000/admin and use the printed token (Bearer)
```

---
## 4. Environment Variables
Required:
- `OPENAI_API_KEY`

Important (Admin / Security):
- `ADMIN_TOKEN` (enable admin features)
- `ADMIN_TOKEN_2` (optional rotation phase)

Behavior / Diagnostics:
- `LOG_REQUESTS=1` – per-request logging
- `HEARTBEAT=0` – disable periodic heartbeat log
- `SELF_PING=1` – keep-alive pings (for ephemeral hosts)
- `ENABLE_CORS=1` – allow cross-origin usage (static frontend + remote API)
- `PUBLIC_TEMPLATES=1` – enable unauthenticated read-only template list

Other:
- `PORT`, `HOST`, `LOG_FILE`

See `.env.example` for inline guidance.

---
## 5. Architecture Notes
Frontend bundle + progressive enhancement scripts:
- `index.html` loads compiled app (`assets/index-*.js`) and enhancement scripts (`ai-helper.js`, `var-popup-integrated.js`).
- Popup script performs layered DOM discovery: direct toggle lookup → captured panel → heuristic scan → rescue build.

Server (`server.js`):
- Express; static file serving with smart cache headers (popup script served `no-store`)
- Admin + template CRUD + variable extraction + auth token endpoints
- OpenAI proxy (`/api/openai`) forwards Chat Completion request (gpt-3.5-turbo by default)

State Persistence (client):
- `VAR_POPUP_POS_V1` (JSON: x,y,w,h)
- `VAR_POPUP_OPEN_V1` ('1' or '0')
- `VAR_POPUP_BASE_V1` (initial baseline size)

---
## 6. Admin API Summary
Authentication: `Authorization: Bearer <token>` header.

Categories:
- GET `/api/admin/categories`
- POST `/api/admin/categories` { name }
- PUT `/api/admin/categories/:id` { name? }
- DELETE `/api/admin/categories/:id`

Templates:
- GET `/api/admin/templates` (omit deleted) | `?all=1` to include archived
- GET `/api/admin/templates/:id`
- POST `/api/admin/templates` { name, categoryId?, body, variables? }
- PUT `/api/admin/templates/:id` (partial)
- DELETE `/api/admin/templates/:id` (soft delete)
- POST `/api/admin/templates/:id/restore`

Bulk:
- GET `/api/admin/export`
- POST `/api/admin/import` { categories:[], templates:[] }

Variables:
- POST `/api/admin/variables/extract` { body }

Tokens:
- GET `/api/admin/auth/tokens`
- POST `/api/admin/auth/tokens` { role, label? }
- POST `/api/admin/auth/tokens/:id/reveal`
- POST `/api/admin/auth/tokens/:id/rotate`
- DELETE `/api/admin/auth/tokens/:id`

Diagnostics:
- GET `/api/ping`
- GET `/api/diag`

Public (optional):
- GET `/api/templates-public` (if `PUBLIC_TEMPLATES=1`)

---
## 7. Deployment
### Docker
```bash
docker build -t email-assistant:v6 .
docker run -p 3000:3000 -e OPENAI_API_KEY=sk-your-key -e ADMIN_TOKEN=your-admin-token email-assistant:v6
```

### Static Frontend + External API
1. Deploy Node server (or Cloudflare Worker) → obtain base URL
2. Serve `index.html` + `assets/` on static host (GitHub Pages / S3 / Netlify)
3. In `index.html` before assistant loads set:
```html
<meta name="ai-api-base" content="https://your-api.example.com">
```
4. Set `ENABLE_CORS=1` on the server for cross-origin use

### Cloudflare Worker
Use `edge-proxy-worker.js` to expose only the OpenAI proxy if you want serverless infra. Configure `OPENAI_API_KEY` via `wrangler secret` and then point the static site at that Worker URL.

---
## 8. Security Considerations
- Never embed `OPENAI_API_KEY` client-side
- Protect admin endpoints with strong random tokens (rotate periodically)
- Consider adding: rate limiting, request size limits (already 1mb), audit logging, and TLS termination at a reverse proxy
- For multi-user deployments, segregate read vs admin tokens (role support already in place)

---
## 9. Development Tips
- Increment the `?v=` query in `index.html` when modifying `var-popup-integrated.js` to avoid stale caching
- To reset popup position/size manually, clear `localStorage` keys (`VAR_POPUP_POS_V1`, `VAR_POPUP_OPEN_V1`)
- Run `npm run doctor` while the server is up for a quick health/auth sanity check

---
## 10. Troubleshooting
| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Popup never appears | Detection missed & not opened before | Click Variables button; script will attempt transform; check console logs `[var-popup-integrated]` |
| Popup appears blank | Underlying DOM restructured | Trigger a manual refresh; ensure build didn't rename variable section labels |
| 500 from `/api/openai` | Missing or invalid key | Set `OPENAI_API_KEY` then restart |
| Admin 401 | Missing/invalid bearer token | Generate via `npm run set-admin-token` |
| Variables not extracted | Token syntax mismatch | Use `<<VariableName>>` or `{{legacy_name}}` |

---
## 11. Roadmap (Nice-to-Have)
- Undo action after Reset
- Animated popup show/hide
- Accessibility pass (ARIA roles, focus traps across all modals)
- Optional removal of version string from internal logs
- Rate limiting & API usage metrics dashboard

---
## 12. License
Private / internal usage (adjust as needed). Add a formal license file if distributing externally.

---
## 13. Attribution
Crafted with iterative UX polishing: draggable popup, single resize handle, heuristic DOM detection, and accented variable parsing.

