// Cloudflare Worker: OpenAI proxy for Email Assistant
// Deploy: wrangler deploy edge-proxy-worker.js
// Bind secret: wrangler secret put OPENAI_API_KEY
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/ping') {
      return new Response(JSON.stringify({ ok: true, edge: true, time: Date.now() }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
    }
    if (url.pathname === '/api/openai' && request.method === 'POST') {
      if (!env.OPENAI_API_KEY) return new Response(JSON.stringify({ error: 'Missing OPENAI_API_KEY' }), { status: 500, headers: cors() });
      let body;
      try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status:400, headers: cors() }); }
      const prompt = body?.prompt;
      if (!prompt || typeof prompt !== 'string') return new Response(JSON.stringify({ error: 'Missing prompt' }), { status:400, headers: cors() });
      const feature = body?.feature || 'generic';
      const started = Date.now();
      try {
        const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
          body: JSON.stringify({ model: 'gpt-3.5-turbo', messages:[{ role:'user', content: prompt }], max_tokens: 800 })
        });
        const data = await openaiResp.json();
        let result = data?.choices?.[0]?.message?.content || '';
        if (!result && Array.isArray(data?.choices)) {
          const agg = data.choices.map(c=>c?.message?.content).filter(Boolean); if(agg.length) result = agg.join('\n\n');
        }
        return new Response(JSON.stringify({ result, latencyMs: Date.now()-started, feature, usage: data?.usage, error: data?.error?.message }), { headers: corsJson() });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status:500, headers: corsJson() });
      }
    }
    if (request.method === 'OPTIONS') return new Response('', { status:204, headers: cors() });
    return new Response('Not Found', { status:404, headers: cors() });
  }
};

function cors(){ return { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization' }; }
function corsJson(){ return { ...cors(), 'Content-Type':'application/json' }; }
