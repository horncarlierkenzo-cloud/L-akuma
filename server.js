// Relais Railway : navigateur -> relais -> Discord.
// Variable optionnelle ALLOWED_ORIGIN : adresse de ta page, ex. https://ton-pseudo.github.io
// (plusieurs adresses possibles, séparées par des virgules).
const http = require('http');

const PORT = process.env.PORT || 3000;
const allowed = (process.env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);

http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const originOk = !allowed.length || allowed.includes(origin);
  const cors = {
    'Access-Control-Allow-Origin': originOk && origin ? origin : (allowed[0] || '*'),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  const end = (status, text, extra = {}) => { res.writeHead(status, { ...cors, ...extra }); res.end(text); };

  if (req.method === 'OPTIONS') return end(204);
  if (req.url === '/' ) return end(200, 'Relais Discord OK');
  if (!originOk) return end(403, 'Origine non autorisée');
  if (!req.url.startsWith('/api/v10/')) return end(404, 'Chemin non autorisé');

  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const headers = { 'User-Agent': 'DiscordBot (https://railway.app, 1.0)' };
    if (req.headers.authorization) headers.Authorization = req.headers.authorization;
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

    const r = await fetch('https://discord.com' + req.url, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) || !body.length ? undefined : body,
    });
    const out = {};
    const ct = r.headers.get('content-type'); if (ct) out['Content-Type'] = ct;
    const ra = r.headers.get('retry-after'); if (ra) out['Retry-After'] = ra;
    end(r.status, r.status === 204 ? undefined : Buffer.from(await r.arrayBuffer()), out);
  } catch (e) {
    end(502, 'Discord injoignable');
  }
}).listen(PORT, () => console.log('Relais prêt sur le port ' + PORT));
