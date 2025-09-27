# Email Assistant v6

Lightweight floating AI assistant with server-side OpenAI proxy.

## Features
- Single body-only email improvement panel (subject removed)
- Live sync: automatically mirrors the external editor (no manual Sync button)
- Actions dropdown: Polish, Correct, Simplify, Translate (EN/FR), Custom instruction
- Instruction field to add extra context to an action
- Secure server endpoint `/api/openai` (the browser never sees your API key)
- Automatic launcher button appears only inside the detected editable field

## Quick Start
1. Install dependencies:
   ```bash
   npm install express node-fetch dotenv
   ```
2. Copy env template and set your key:
   ```bash
   cp .env.example .env
   # edit .env -> OPENAI_API_KEY=sk-...
   ```
3. Start the server:
   ```bash
   node server.js
   # or add a start script to package.json then: npm start
   ```
4. Open http://localhost:3000
5. Click into (or focus) your email editing area; an "IA ✨" button appears. Click it to open the assistant.

## Environment Variables
See `.env.example`. Only `OPENAI_API_KEY` is required. Optional flags: `LOG_REQUESTS`, `HEARTBEAT`, `SELF_PING`, `PORT`, `HOST`.

## Security
The OpenAI key lives only in `.env`. It is never embedded client-side. The frontend sends prompts to `/api/openai`; the server forwards them to OpenAI securely.

## Possible Enhancements
- Rate limiting for `/api/openai`
- Internal auth token requirement
- Auto-apply results back to external editor
- Additional translation languages

## Troubleshooting
- 500 error from `/api/openai`: ensure `OPENAI_API_KEY` set and server restarted
- Button not appearing: ensure there is a textarea or contenteditable element present
- No text pulled: confirm the element isn't inside an iframe (iframe support can be added later)

## License
Private / internal usage (adjust as needed).

## Deployment
### Docker
Build image:
```bash
docker build -t email-assistant:v7 .
```
Run (pass key via env):
```bash
docker run -p 3000:3000 -e OPENAI_API_KEY=sk-your-key email-assistant:v7
```
Visit: http://localhost:3000

### Render / Railway / Fly.io / Heroku
1. Add repository
2. Set environment variable `OPENAI_API_KEY`
3. Build command (Node 18+): (none needed unless you add a build step)
4. Start command: `node server.js`

### Static host + separate API
If hosting `index.html` + assets on a static CDN but API on another domain:
1. Set `ENABLE_CORS=1` on the server environment.
2. In your HTML (static site) set:
```html
<script>window.AI_API_BASE='https://your-api-domain';</script>
```
or
```html
<meta name="ai-api-base" content="https://your-api-domain">
```
3. Ensure HTTPS both sides to avoid mixed content blocking.

### Health Checks
- `/api/ping` basic OK
- `/api/diag` returns env flags and memory info (safe subset)

### Hardening Ideas (optional)
- Add reverse proxy (nginx / caddy) in front for TLS termination.
- Set rate limiting & auth token.
- Rotate API key periodically; container restart picks it up.

### Zero-Downtime Redeploy (Docker example)
```bash
docker build -t email-assistant:latest .
docker stop email-assistant || true
docker rm email-assistant || true
docker run -d --name email-assistant -p 3000:3000 -e OPENAI_API_KEY=sk-your-key email-assistant:latest
```
