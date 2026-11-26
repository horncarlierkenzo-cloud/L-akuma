
// server.js — API sécurisée du panneau Papillon Ombre
'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || '';
const DEFAULT_GUILD_ID = process.env.PANEL_GUILD_ID || '';
const ROLE_NAME = process.env.AKUMA_ROLE || 'Akumatisé';

const allowedOrigins = (process.env.ALLOWED_ORIGIN || '')
  .split(',').map(x => x.trim()).filter(Boolean);

if (!PANEL_PASSWORD) {
  console.error('[API] PANEL_PASSWORD manque dans les variables de l’hébergeur.');
  process.exit(1);
}

// index.js doit exporter le client Discord avec : module.exports = client;
const client = require('./index.js');

if (!client || typeof client.isReady !== 'function') {
  console.error('[API] Le fichier index.js doit finir par : module.exports = client;');
  process.exit(1);
}

const sessions = new Map();
const timers = new Map();
const dataDir = path.join(__dirname, 'data');
const stateFile = path.join(dataDir, 'site-state.json');

function readState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return {
      logs: Array.isArray(s.logs) ? s.logs : [],
      purifications: Array.isArray(s.purifications) ? s.purifications : [],
      event: s.event || { active: false, startedAt: null }
    };
  } catch {
    return { logs: [], purifications: [], event: { active: false, startedAt: null } };
  }
}

let state = readState();

function saveState() {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[API] Sauvegarde impossible :', e.message);
  }
}

function log(text) {
  state.logs.unshift({
    at: new Date().toISOString(),
    text: String(text).slice(0, 500)
  });
  state.logs = state.logs.slice(0, 300);
  saveState();
}

function recordPurification(username, status, source = 'Panneau') {
  state.purifications.unshift({
    at: new Date().toISOString(),
    username,
    status,
    source
  });
  state.purifications = state.purifications.slice(0, 300);
  saveState();
}

function json(res, status, value, cors) {
  res.writeHead(status, {
    ...cors,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(value));
}

function text(res, status, value, cors) {
  res.writeHead(status, {
    ...cors,
    'Content-Type': 'text/plain; charset=utf-8'
  });
  res.end(value || '');
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('Requête trop volumineuse.');
    chunks.push(chunk);
  }

  if (!size) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function getGuild(id) {
  const guildId = String(id || DEFAULT_GUILD_ID);

  if (!/^\d{17,20}$/.test(guildId)) {
    throw new Error('Identifiant du serveur invalide.');
  }

  const guild = client.guilds.cache.get(guildId);

  if (!guild) {
    throw new Error('Le bot ne se trouve pas sur ce serveur. Vérifie son invitation et PANEL_GUILD_ID.');
  }

  return guild;
}

function requireMember(guild, id) {
  if (!/^\d{17,20}$/.test(String(id || ''))) {
    throw new Error('Identifiant du membre invalide.');
  }

  return guild.members.fetch(id);
}

function findRole(guild, name) {
  return guild.roles.cache.find(r => r.name === name) || null;
}

function slugLabel(key) {
  const labels = {
    stoneheart: 'Stoneheart',
    'dark-owl': 'Dark Owl',
    evillustrator: 'Evillustrator',
    bubbler: 'Bubbler',
    rogercop: 'Rogercop',
    sandboy: 'Sandboy',
    antibug: 'Antibug',
    reflekta: 'Reflekta',
    'princess-fragrance': 'Princess Fragrance',
    pharaoh: 'Pharaoh',
    'miraculous-queen': 'Miraculous Queen',
    timebreaker: 'Timebreaker'
  };

  return labels[key] || String(key || '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function memberData(m) {
  const amoks = m.roles.cache
    .filter(r => r.name.startsWith('Amok · '))
    .map(r => r.name.slice(7));

  return {
    id: m.id,
    name: m.displayName || m.user.username,
    username: m.user.username,
    akuma: m.roles.cache.some(r => r.name === ROLE_NAME),
    amoks
  };
}

async function announce(guild, channelId, message, replacements = {}) {
  if (!channelId || !message) return;

  const channel = guild.channels.cache.get(String(channelId));

  if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') {
    throw new Error('Salon d’annonce introuvable ou non accessible.');
  }

  let content = String(message);

  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(`{${key}}`, String(value));
  }

  await channel.send({
    content: content.slice(0, 1900),
    allowedMentions: { parse: [] }
  });
}

function apiError(res, error, cors) {
  console.error('[API]', error);
  json(res, 400, {
    error: error.message || 'Une erreur est survenue.'
  }, cors);
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';

  const originAllowed =
    !origin ||
    allowedOrigins.length === 0 ||
    allowedOrigins.includes(origin);

  const cors = {
    'Access-Control-Allow-Origin':
      origin && originAllowed ? origin : (allowedOrigins[0] || '*'),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }

  if (!originAllowed) {
    return text(res, 403, 'Origine non autorisée', cors);
  }

  const url = new URL(
    req.url,
    `http://${req.headers.host || 'localhost'}`
  );

  if (req.method === 'GET' && url.pathname === '/') {
    return text(res, 200, 'Papillon Ombre API OK', cors);
  }

  if (url.pathname === '/health') {
    return json(res, 200, {
      ok: true,
      botReady: client.isReady()
    }, cors);
  }

  try {
    // CONNEXION AU PANNEAU
    if (req.method === 'POST' && url.pathname === '/api/login') {
      const body = await readBody(req);

      if (!safeEqual(body.password || '', PANEL_PASSWORD)) {
        return json(res, 401, {
          error: 'Mot de passe incorrect.'
        }, cors);
      }

      const token = crypto.randomBytes(32).toString('hex');

      sessions.set(token, Date.now() + 12 * 60 * 60 * 1000);

      return json(res, 200, { token }, cors);
    }

    // VÉRIFICATION DE LA SESSION
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const expires = sessions.get(token);

    if (!token || !expires || expires < Date.now()) {
      if (token) sessions.delete(token);

      return json(res, 401, {
        error: 'Session expirée. Reconnecte-toi.'
      }, cors);
    }

    const body = req.method === 'GET' ? {} : await readBody(req);

    const guild = getGuild(
      body.guildId ||
      url.searchParams.get('guildId') ||
      DEFAULT_GUILD_ID
    );

    // ÉTAT DU SITE
    if (req.method === 'GET' && url.pathname === '/api/state') {
      return json(res, 200, state, cors);
    }

    // MEMBRES DISCORD
    if (req.method === 'GET' && url.pathname === '/api/members') {
      await guild.members.fetch();

      const members = guild.members.cache
        .filter(m => !m.user.bot)
        .map(memberData)
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

      return json(res, 200, { members }, cors);
    }

    // SALONS DISCORD
    if (req.method === 'GET' && url.pathname === '/api/channels') {
      const channels = guild.channels.cache
        .filter(c => c.isTextBased() && typeof c.send === 'function')
        .map(c => ({ id: c.id, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

      return json(res, 200, { channels }, cors);
    }

    // MESSAGE PRIVÉ
    if (req.method === 'POST' && url.pathname === '/api/dm') {
      const member = await requireMember(guild, body.userId);
      const message = String(body.message || '').trim();

      if (!message) {
        throw new Error('Écris un message avant de l’envoyer.');
      }

      await member.send({
        content: message.slice(0, 1900),
        allowedMentions: { parse: [] }
      });

      log(`Message privé envoyé à ${member.user.username}.`);

      return json(res, 200, { ok: true }, cors);
    }

    // AKUMATISATION
    if (req.method === 'POST' && url.pathname === '/api/akumatize') {
      const member = await requireMember(guild, body.userId);

      if (member.user.bot) {
        throw new Error('Un bot ne peut pas être akumatisé.');
      }

      const role = findRole(guild, ROLE_NAME);

      if (!role) {
        throw new Error(`Le rôle « ${ROLE_NAME} » n’existe pas.`);
      }

      const emotion = String(body.emotion || 'émotion').slice(0, 100);
      const power = slugLabel(body.powerKey || 'pouvoir');

      const dmTemplate = String(
        body.dm || '🦋 {name}, je t’offre le pouvoir de {power}.'
      ).slice(0, 1800);

      const dm = dmTemplate
        .replaceAll('{name}', member.displayName || member.user.username)
        .replaceAll('{emotion}', emotion)
        .replaceAll('{power}', power);

      // Message privé envoyé avant l'ajout du rôle.
      await member.send({
        content: dm,
        allowedMentions: { parse: [] }
      });

      await member.roles.add(
        role,
        'Akumatisation depuis le panneau Papillon Ombre'
      );

      const duration = Math.max(
        0,
        Math.min(10080, Number(body.durationMin) || 0)
      );

      if (timers.has(member.id)) {
        clearTimeout(timers.get(member.id));
      }

      if (duration > 0) {
        const timer = setTimeout(async () => {
          try {
            const fresh = await guild.members.fetch(member.id);

            await fresh.roles.remove(
              role,
              'Fin de durée de l’akumatisation'
            );

            log(`Fin automatique de l’akumatisation de ${fresh.user.username}.`);
          } catch (e) {
            console.error('[API] Expiration akuma :', e.message);
          }

          timers.delete(member.id);
        }, duration * 60 * 1000);

        timer.unref();
        timers.set(member.id, timer);
      }

      if (body.changeNick && member.manageable) {
        const nick = String(body.nickFormat || '🦋 {name}')
          .replaceAll('{name}', member.displayName || member.user.username)
          .slice(0, 32);

        await member.setNickname(
          nick,
          'Akumatisation depuis le panneau'
        ).catch(() => {});
      }

      const announcement = String(body.announcement || '')
        .replaceAll('{user}', member.displayName || member.user.username)
        .replaceAll('{emotion}', emotion)
        .replaceAll('{power}', power);

      if (body.channelId && announcement) {
        await announce(guild, body.channelId, announcement);
      }

      log(`${member.user.username} a été akumatisé (${power}).`);

      return json(res, 200, { ok: true }, cors);
    }

    // PURIFICATION
    if (req.method === 'POST' && url.pathname === '/api/purify') {
      const member = await requireMember(guild, body.userId);
      const role = findRole(guild, ROLE_NAME);

      if (!role || !member.roles.cache.has(role.id)) {
        throw new Error('Ce membre n’a pas le rôle Akumatisé.');
      }

      await member.roles.remove(
        role,
        'Purification depuis le panneau'
      );

      if (timers.has(member.id)) {
        clearTimeout(timers.get(member.id));
        timers.delete(member.id);
      }

      const amokRoles = member.roles.cache.filter(
        r => r.name.startsWith('Amok · ')
      );

      if (amokRoles.size) {
        await member.roles.remove(
          [...amokRoles.values()],
          'Purification depuis le panneau'
        );
      }

      recordPurification(
        member.user.username,
        'Purifié',
        'Panneau'
      );

      log(`${member.user.username} a été purifié depuis le panneau.`);

      return json(res, 200, { ok: true }, cors);
    }

    // ATTRIBUTION D'UN AMOK
    if (req.method === 'POST' && url.pathname === '/api/amok') {
      const member = await requireMember(guild, body.userId);

      if (!member.roles.cache.some(r => r.name === ROLE_NAME)) {
        throw new Error('Le membre doit être akumatisé avant de recevoir un amok.');
      }

      const key = String(body.amokKey || '');

      if (!/^[a-z0-9-]{2,50}$/.test(key)) {
        throw new Error('Amok invalide.');
      }

      const roleName = `Amok · ${slugLabel(key)}`;
      const role = findRole(guild, roleName);

      if (!role) {
        throw new Error(`Crée d’abord le rôle Discord « ${roleName} » puis réessaie.`);
      }

      const previous = member.roles.cache.filter(
        r => r.name.startsWith('Amok · ')
      );

      if (previous.size) {
        await member.roles.remove(
          [...previous.values()],
          'Remplacement de l’amok'
        );
      }

      await member.roles.add(
        role,
        'Amok attribué depuis le panneau'
      );

      log(`Amok ${slugLabel(key)} attribué à ${member.user.username}.`);

      return json(res, 200, { ok: true }, cors);
    }

    // RETRAIT D'UN AMOK
    if (req.method === 'POST' && url.pathname === '/api/unamok') {
      const member = await requireMember(guild, body.userId);

      const previous = member.roles.cache.filter(
        r => r.name.startsWith('Amok · ')
      );

      if (previous.size) {
        await member.roles.remove(
          [...previous.values()],
          'Amok retiré depuis le panneau'
        );
      }

      log(`Amok retiré à ${member.user.username}.`);

      return json(res, 200, { ok: true }, cors);
    }

    // DÉMARRAGE DE L'ÉVÉNEMENT
    if (req.method === 'POST' && url.pathname === '/api/event/start') {
      state.event = {
        active: true,
        startedAt: new Date().toISOString()
      };

      if (body.channelId && body.message) {
        await announce(guild, body.channelId, body.message);
      }

      log('Événement Digital Circus × Miraculous démarré.');
      saveState();

      return json(res, 200, {
        ok: true,
        event: state.event
      }, cors);
    }

    // FIN DE L'ÉVÉNEMENT
    if (req.method === 'POST' && url.pathname === '/api/event/end') {
      state.event = {
        active: false,
        startedAt: null
      };

      if (body.channelId && body.message) {
        await announce(guild, body.channelId, body.message);
      }

      log('Événement Digital Circus × Miraculous terminé.');
      saveState();

      return json(res, 200, {
        ok: true,
        event: state.event
      }, cors);
    }

    return json(res, 404, {
      error: 'Route API introuvable.'
    }, cors);

  } catch (error) {
    return apiError(res, error, cors);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[API] Papillon Ombre écoute sur le port ${PORT}.`);
});
