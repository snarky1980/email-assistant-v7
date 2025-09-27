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
