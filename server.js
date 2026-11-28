
'use strict';

console.log('[DIAGNOSTIC] server.js démarre');

// ==================================================
// SERVEUR DU PANNEAU PAPILLON OMBRE
// ==================================================

const http = require('http');
const crypto = require('crypto');

if (!process.env.DISCORD_TOKEN) {
  throw new Error('DISCORD_TOKEN doit être configuré sur Render.');
}

console.log('[DIAGNOSTIC] Chargement de index.js...');
const client = require('./index.js');
console.log('[DIAGNOSTIC] index.js chargé');

const {
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');

console.log('[DIAGNOSTIC] Chargement de powers.js...');
const base = require('./powers');
console.log('[DIAGNOSTIC] powers.js chargé');
const extra = require('./powers-extra');
console.log('[DIAGNOSTIC] powers-extra.js chargé');
const siteState = require('./site-state');
console.log('[DIAGNOSTIC] site-state.js chargé');
const jaxChaos = require('./jax-chaos');
console.log('[DIAGNOSTIC] jax-chaos.js chargé');

const PORT = Number(process.env.PORT || 3000);
const PASSWORD = process.env.PANEL_PASSWORD || '';
const GUILD_ID = process.env.PANEL_GUILD_ID || '';
const ROLE_NAME = process.env.AKUMA_ROLE || 'Akumatisé';

const ALLOWED = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map(x => x.trim().replace(/\/+$/, '').toLowerCase())
  .filter(Boolean);

const SESSION_TTL = 12 * 60 * 60 * 1000;

const sessions = new Map();
const loginAttempts = new Map();

const powers = [
  ...(base.POWERS || []).filter(
    p => !(extra.POWERS || []).some(e => e.key === p.key)
  ),
  ...(extra.POWERS || [])
];

// ==================================================
// LISTE DES AMOKS
// ==================================================

const amoks = [
  ['stoneheart', 'Stoneheart'],
  ['dark-owl', 'Dark Owl'],
  ['evillustrator', 'Evillustrator'],
  ['bubbler', 'Bubbler'],
  ['rogercop', 'Rogercop'],
  ['sandboy', 'Sandboy'],
  ['antibug', 'Antibug'],
  ['reflekta', 'Reflekta'],
  ['princess-fragrance', 'Princess Fragrance'],
  ['pharaoh', 'Pharaoh'],
  ['miraculous-queen', 'Miraculous Queen'],
  ['timebreaker', 'Timebreaker']
];

const amokName = key => {
  const item = amoks.find(x => x[0] === key);
  return item ? `Amok · ${item[1]}` : null;
};

// ==================================================
// RÉPONSES HTTP
// ==================================================

function json(res, status, value, headers = {}) {
  const body = JSON.stringify(value);

  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });

  res.end(body);
}

function cors(req, res) {
  const origin = (req.headers.origin || '')
    .trim()
    .replace(/\/+$/, '')
    .toLowerCase();

  console.log('[CORS] Origine reçue :', origin || '(aucune)');
  console.log('[CORS] Origines autorisées :', ALLOWED);

  if (origin && ALLOWED.length && !ALLOWED.includes(origin)) {
    console.warn('[CORS] REFUSÉE :', origin);
    return false;
  }

  if (origin && ALLOWED.includes(origin)) {
    console.log('[CORS] AUTORISÉE :', origin);
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type'
    );
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, OPTIONS'
    );
    res.setHeader('Access-Control-Max-Age', '86400');
  } else if (origin && !ALLOWED.length) {
    console.error('[CORS] Aucune origine autorisée : vérifie ALLOWED_ORIGIN sur Render.');
  }

  return true;
}

async function bodyOf(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;

    if (size > 1024 * 1024) {
      throw new Error('Requête trop volumineuse.');
    }

    chunks.push(chunk);
  }

  if (!size) return {};

  return JSON.parse(
    Buffer.concat(chunks).toString('utf8')
  );
}

// ==================================================
// AUTHENTIFICATION
// ==================================================

function tokenFrom(req) {
  const header = String(req.headers.authorization || '');

  return header.startsWith('Bearer ')
    ? header.slice(7)
    : '';
}

function authenticated(req) {
  const token = tokenFrom(req);
  const entry = sessions.get(token);

  if (!entry || entry.expires < Date.now()) {
    if (entry) sessions.delete(token);
    return false;
  }

  entry.expires = Date.now() + SESSION_TTL;

  return true;
}

function requireGuildId(body, queryGuildId) {
  const id = String(
    body.guildId || queryGuildId || GUILD_ID || ''
  );

  if (!/^\d{15,25}$/.test(id)) {
    throw new Error(
      'Identifiant du serveur invalide. Vérifie PANEL_GUILD_ID.'
    );
  }

  return id;
}

// ==================================================
// DISCORD
// ==================================================

async function getGuild(id) {
  if (!client || !client.isReady()) {
    throw new Error(
      'Le bot Discord n’est pas encore connecté.'
    );
  }

  return (
    client.guilds.cache.get(id) ||
    await client.guilds.fetch(id)
  );
}

async function getMember(guild, id) {
  if (!/^\d{15,25}$/.test(String(id))) {
    throw new Error('Identifiant de membre invalide.');
  }

  const member = await guild.members.fetch({
    user: String(id),
    force: true
  });

  if (!member || member.user.bot) {
    throw new Error('Membre introuvable ou compte bot.');
  }

  if (!member.manageable) {
    throw new Error(
      'Le bot ne peut pas gérer ce membre. Vérifie la hiérarchie des rôles.'
    );
  }

  return member;
}

async function ensureRole(guild, name, color = 0x7b2cbf) {
  let role = guild.roles.cache.find(r => r.name === name);

  if (!role) {
    role = await guild.roles.create({
      name,
      color,
      reason: 'Panneau de gestion Papillon Ombre'
    });
  }

  if (!role.editable) {
    throw new Error(
      `Le rôle « ${name} » doit être placé sous le rôle du bot.`
    );
  }

  return role;
}

// ==================================================
// MESSAGES PRIVÉS
// ==================================================

function fill(template, vars) {
  return String(template || '').replace(
    /\{(user|name|emotion|power)\}/g,
    (_, key) => vars[key] == null ? '' : String(vars[key])
  );
}

async function sendPrivate(member, message, power) {
  const embed = new EmbedBuilder()
    .setColor(0x8b4bd6)
    .setTitle('🦋 Message de Papillon Ombre')
    .setDescription(String(message).slice(0, 3500));

  if (power) {
    embed.addFields({
      name: `${power.emoji || '✨'} ${power.label}`,
      value: `${power.desc || 'Pouvoir mystérieux.'}\nCommande : **/pouvoir**`
    });

    embed.setFooter({
      text: `Pouvoir : ${power.label} · /pouvoir`
    });
  }

  await member.send({ embeds: [embed] });
}

// ==================================================
// AKUMATISATION SPÉCIALE DE JAX
// ==================================================

async function akumatizeJax(guild, member, body, guildId) {
  const event = siteState.getState().event;

  if (!event.active) {
    throw new Error(
      'L’événement doit être démarré avant d’akumatiser Jax Chaos.'
    );
  }

  if (member.roles.cache.some(r => r.name === ROLE_NAME)) {
    throw new Error('Ce membre est déjà akumatisé.');
  }

  const emotion = String(body.emotion || 'Chaos').slice(0, 80);

  const dmText = String(
    body.dm ||
    '🦋 Jax… ton esprit est rempli de chaos. Je t’offre le pouvoir de bouleverser ce cirque. Tu es désormais Jax Chaos ! Utilise **/jax** pour ouvrir ton panneau privé.'
  ).slice(0, 3500);

  const role = await ensureRole(guild, ROLE_NAME);

  // Le message privé est envoyé avant l'ajout du rôle.
  await sendPrivate(
    member,
    fill(dmText, {
      user: `<@${member.id}>`,
      name: member.displayName,
      emotion,
      power: 'Jax Chaos'
    }),
    null
  );

  await member.roles.add(
    role,
    'Akumatisation spéciale Jax Chaos'
  );

  const entry = {
    name: member.displayName,
    emotion,
    power: 'Jax Chaos',
    powerKey: 'jax-chaos',
    jaxChaos: true,
    originalNick: member.nickname,
    startedAt: Date.now(),
    endsAt: Number(body.durationMin) > 0
      ? Date.now() +
        Math.min(10080, Number(body.durationMin)) * 60000
      : null,
    amok: null
  };

  siteState.setAkuma(guildId, member.id, entry);

  // Les fragments ne deviennent accessibles qu'à cette étape.
  siteState.setEvent({
    active: true,
    stage: 'chaos',
    fragmentsUnlocked: true,
    jaxUserId: member.id,
    jaxUsername: member.displayName,
    jaxAkumatizedAt: Date.now()
  });

  if (body.changeNick) {
    await member.setNickname(
      fill(
        String(body.nickFormat || '🐰 Jax Chaos · {name}'),
        { name: member.displayName }
      ).slice(0, 32),
      'Akumatisation Jax Chaos'
    ).catch(() => {});
  }

  const announcement =
    String(
      body.announcement ||
      '🦋 **ALERTE ! Jax vient d’être akumatisé en Jax Chaos !** Le Digital Circus est contaminé par le chaos. Les missions des fragments du Lucky Charm sont maintenant accessibles !'
    ).slice(0, 1800);

  if (body.channelId) {
    const channel = await guild.channels.fetch(
      String(body.channelId)
    );

    if (!channel || !channel.isTextBased()) {
      throw new Error('Salon d’annonce introuvable.');
    }

    await channel.send({
      content: fill(announcement, {
        user: `<@${member.id}>`,
        name: member.displayName,
        emotion,
        power: 'Jax Chaos'
      }),
      allowedMentions: {
        users: [member.id]
      }
    });
  }

  siteState.addLog(
    `🐰 ${member.displayName} est devenu Jax Chaos. Les fragments sont déverrouillés.`,
    true,
    'jax'
  );

  return {
    ok: true,
    member: member.displayName,
    eventStage: 'chaos'
  };
}

// ==================================================
// ROUTES API
// ==================================================

async function route(req, res) {
  if (!cors(req, res)) {
    return json(res, 403, {
      error: 'Origine non autorisée.'
    });
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, 'http://localhost');

  if (
    req.method === 'GET' &&
    url.pathname === '/'
  ) {
    return json(res, 200, {
      ok: true,
      service: 'Panneau Papillon Ombre',
      botReady: !!(client && client.isReady())
    });
  }

  // ----------------------------------------------
  // CONNEXION
  // ----------------------------------------------

  if (
    req.method === 'POST' &&
    url.pathname === '/api/login'
  ) {
    if (!PASSWORD) {
      return json(res, 503, {
        error: 'PANEL_PASSWORD n’est pas configuré sur Render.'
      });
    }

    const ip = req.socket.remoteAddress || 'unknown';

    const attempt = loginAttempts.get(ip) || {
      count: 0,
      until: Date.now() + 15 * 60 * 1000
    };

    if (attempt.until < Date.now()) {
      attempt.count = 0;
      attempt.until = Date.now() + 15 * 60 * 1000;
    }

    if (attempt.count >= 8) {
      return json(res, 429, {
        error: 'Trop de tentatives. Réessaie dans 15 minutes.'
      });
    }

    const body = await bodyOf(req);

    const supplied = Buffer.from(
      String(body.password || '')
    );

    const expected = Buffer.from(PASSWORD);

    const valid =
      supplied.length === expected.length &&
      crypto.timingSafeEqual(supplied, expected);

    if (!valid) {
      attempt.count++;
      loginAttempts.set(ip, attempt);

      return json(res, 401, {
        error: 'Mot de passe incorrect.'
      });
    }

    loginAttempts.delete(ip);

    const token = crypto.randomBytes(32).toString('hex');

    sessions.set(token, {
      expires: Date.now() + SESSION_TTL
    });

    return json(res, 200, {
      token,
      expiresIn: SESSION_TTL
    });
  }

  if (!url.pathname.startsWith('/api/')) {
    return json(res, 404, {
      error: 'Route inconnue.'
    });
  }

  if (!authenticated(req)) {
    return json(res, 401, {
      error: 'Session expirée. Reconnecte-toi.'
    });
  }

  const body = req.method === 'POST'
    ? await bodyOf(req)
    : {};

  const guildId = requireGuildId(
    body,
    url.searchParams.get('guildId')
  );

  const guild = await getGuild(guildId);

  // ----------------------------------------------
  // ÉTAT DU PANNEAU
  // ----------------------------------------------

  if (
    req.method === 'GET' &&
    url.pathname === '/api/state'
  ) {
    const s = siteState.getState();

    return json(res, 200, {
      guild: {
        id: guild.id,
        name: guild.name
      },
      bot: client.user.username,
      event: s.event,
      purifications: s.purifications
        .filter(x => x.guildId === guildId)
        .slice(0, 60),
      logs: s.logs.slice(0, 80)
    });
  }

  // ----------------------------------------------
  // MEMBRES
  // ----------------------------------------------

  if (
    req.method === 'GET' &&
    url.pathname === '/api/members'
  ) {
    await guild.members.fetch();

    const members = [
      ...guild.members.cache.values()
    ]
      .filter(m => !m.user.bot)
      .map(m => ({
        id: m.id,
        username: m.user.username,
        name: m.displayName,
        avatar: m.displayAvatarURL({ size: 64 }),
        akuma: m.roles.cache.some(
          r => r.name === ROLE_NAME
        ),
        amoks: m.roles.cache
          .filter(r => r.name.startsWith('Amok · '))
          .map(r => r.name.slice(7)),
        manageable: m.manageable
      }));

    members.sort(
      (a, b) => a.name.localeCompare(b.name, 'fr')
    );

    return json(res, 200, { members });
  }

  // ----------------------------------------------
  // SALONS
  // ----------------------------------------------

  if (
    req.method === 'GET' &&
    url.pathname === '/api/channels'
  ) {
    const channels = [
      ...guild.channels.cache.values()
    ]
      .filter(
        c => c.isTextBased() && typeof c.send === 'function'
      )
      .map(c => ({
        id: c.id,
        name: c.name,
        type: c.type
      }));

    return json(res, 200, { channels });
  }

  // ----------------------------------------------
  // JOURNAL
  // ----------------------------------------------

  if (
    req.method === 'GET' &&
    url.pathname === '/api/logs'
  ) {
    const s = siteState.getState();

    return json(res, 200, {
      logs: s.logs,
      purifications: s.purifications.filter(
        x => x.guildId === guildId
      )
    });
  }

  if (req.method !== 'POST') {
    return json(res, 405, {
      error: 'Méthode non autorisée.'
    });
  }

  // ----------------------------------------------
  // MESSAGE PRIVÉ
  // ----------------------------------------------

  if (url.pathname === '/api/dm') {
    const member = await guild.members.fetch({
      user: String(body.userId),
      force: true
    });

    if (!member || member.user.bot) {
      throw new Error('Membre introuvable ou compte bot.');
    }

    const message = String(body.message || '').trim();

    if (!message) {
      throw new Error('Écris un message privé.');
    }

    await sendPrivate(member, message, null);

    siteState.addLog(
      `✉️ Message privé envoyé à ${member.displayName}.`,
      true,
      'message'
    );

    return json(res, 200, { ok: true });
  }

  // ----------------------------------------------
  // AKUMATISATION
  // ----------------------------------------------

  if (url.pathname === '/api/akumatize') {
    const member = await getMember(guild, body.userId);

    if (String(body.powerKey) === 'jax-chaos') {
      const result = await akumatizeJax(
        guild,
        member,
        body,
        guildId
      );

      return json(res, 200, result);
    }

    if (
      member.roles.cache.some(r => r.name === ROLE_NAME)
    ) {
      throw new Error(
        'Ce membre est déjà akumatisé.'
      );
    }

    const emotion = String(
      body.emotion || 'Mystère'
    ).slice(0, 80);

    const power = powers.find(
      p => p.key === String(body.powerKey || '')
    ) || null;

    const entry = {
      name: member.displayName,
      emotion,
      power: power ? power.label : '',
      powerKey: body.powerKey || null,
      originalNick: member.nickname,
      startedAt: Date.now(),
      endsAt: Number(body.durationMin) > 0
        ? Date.now() +
          Math.min(10080, Number(body.durationMin)) * 60000
        : null,
      amok: null
    };

    const dmText = String(
      body.dm ||
      '🦋 Une émotion t’a touché : {emotion}. Papillon Ombre t’offre un pouvoir : {power}.'
    ).slice(0, 3500);

    await sendPrivate(
      member,
      fill(dmText, {
        user: `<@${member.id}>`,
        name: member.displayName,
        emotion,
        power: power ? power.label : '—'
      }),
      power
    );

    const role = await ensureRole(guild, ROLE_NAME);

    await member.roles.add(
      role,
      'Akumatisation depuis le panneau web'
    );

    if (body.changeNick) {
      await member.setNickname(
        fill(
          String(body.nickFormat || '🦋 {name}'),
          { name: member.displayName }
        ).slice(0, 32),
        'Akumatisation'
      );
    }

    siteState.setAkuma(
      guildId,
      member.id,
      entry
    );

    if (body.channelId) {
      const channel = await guild.channels.fetch(
        String(body.channelId)
      );

      if (channel && channel.isTextBased()) {
        await channel.send({
          content: fill(
            String(
              body.announcement ||
              '🦋 {user} a été akumatisé(e) ! Émotion : {emotion}. Pouvoir : {power}.'
            ),
            {
              user: `<@${member.id}>`,
              name: member.displayName,
              emotion,
              power: power ? power.label : 'aucun'
            }
          ),
          allowedMentions: {
            users: [member.id]
          }
        });
      }
    }

    siteState.addLog(
      `🦋 ${member.displayName} a été akumatisé(e) (${emotion}).`,
      true,
      'akuma'
    );

    return json(res, 200, {
      ok: true,
      member: member.displayName
    });
  }

  // ----------------------------------------------
  // PURIFICATION
  // ----------------------------------------------

  if (url.pathname === '/api/purify') {
    const member = await getMember(guild, body.userId);

    const role = guild.roles.cache.find(
      r => r.name === ROLE_NAME
    );

    if (!role || !member.roles.cache.has(role.id)) {
      throw new Error(
        'Ce membre ne possède pas le rôle Akumatisé.'
      );
    }

    const old = siteState.getState().akuma[
      `${guildId}:${member.id}`
    ];

    // Si Jax est purifié, on restaure le serveur.
    if (
      old &&
      (
        old.jaxChaos === true ||
        old.powerKey === 'jax-chaos'
      )
    ) {
      try {
        await jaxChaos.restoreServer(guild);
      } catch (error) {
        siteState.addLog(
          `⚠️ Restauration Jax incomplète : ${error.message}`,
          false,
          'repair-error'
        );
      }

      siteState.setEvent({
        stage: 'terminé',
        fragmentsUnlocked: false,
        active: false,
        endedAt: Date.now()
      });
    }

    await member.roles.remove(
      role,
      'Purification depuis le panneau'
    );

    for (const r of member.roles.cache.values()) {
      if (r.name.startsWith('Amok · ')) {
        await member.roles.remove(r, 'Purification');
      }
    }

    if (
      old &&
      member.manageable &&
      (member.nickname || null) !==
        (old.originalNick || null)
    ) {
      await member.setNickname(
        old.originalNick || null,
        'Restauration après purification'
      ).catch(() => {});
    }

    siteState.recordPurification(
      guildId,
      member.id,
      member.displayName,
      'Panneau'
    );

    return json(res, 200, { ok: true });
  }

  // ----------------------------------------------
  // ATTRIBUTION AMOK
  // ----------------------------------------------

  if (url.pathname === '/api/amok') {
    const member = await getMember(guild, body.userId);

    if (
      !member.roles.cache.some(r => r.name === ROLE_NAME)
    ) {
      throw new Error(
        'Akumatise d’abord ce membre.'
      );
    }

    const name = amokName(
      String(body.amokKey || '')
    );

    if (!name) {
      throw new Error('Choisis un Amok valide.');
    }

    if (
      member.roles.cache.some(
        r => r.name.startsWith('Amok · ')
      )
    ) {
      throw new Error(
        'Ce membre possède déjà un Amok.'
      );
    }

    const role = await ensureRole(
      guild,
      name,
      0xe0457b
    );

    await member.roles.add(
      role,
      'Amok attribué depuis le panneau'
    );

    const s = siteState.getState();

    const entry = s.akuma[
      `${guildId}:${member.id}`
    ] || {
      name: member.displayName,
      startedAt: Date.now()
    };

    entry.amok = String(body.amokKey);

    siteState.setAkuma(
      guildId,
      member.id,
      entry
    );

    siteState.addLog(
      `🪶 ${member.displayName} reçoit ${name}.`,
      true,
      'amok'
    );

    return json(res, 200, { ok: true });
  }

  // ----------------------------------------------
  // RETRAIT AMOK
  // ----------------------------------------------

  if (url.pathname === '/api/unamok') {
    const member = await getMember(guild, body.userId);

    const roles = member.roles.cache.filter(
      r => r.name.startsWith('Amok · ')
    );

    if (!roles.size) {
      throw new Error(
        'Ce membre ne possède aucun Amok.'
      );
    }

    for (const role of roles.values()) {
      await member.roles.remove(
        role,
        'Amok retiré depuis le panneau'
      );
    }

    const s = siteState.getState();

    const entry = s.akuma[
      `${guildId}:${member.id}`
    ];

    if (entry) {
      delete entry.amok;

      siteState.setAkuma(
        guildId,
        member.id,
        entry
      );
    }

    siteState.addLog(
      `🪶 Amok retiré à ${member.displayName}.`,
      true,
      'amok'
    );

    return json(res, 200, { ok: true });
  }

  // ----------------------------------------------
  // ACTIVATION / LANCEMENT / ARRÊT ÉVÉNEMENT
  // ----------------------------------------------

  if (
    url.pathname === '/api/event/activate' ||
    url.pathname === '/api/event/start' ||
    url.pathname === '/api/event/launch' ||
    url.pathname === '/api/event/end'
  ) {
    const activate = url.pathname.endsWith('/activate');
    const start = url.pathname.endsWith('/start');
    const launch = url.pathname.endsWith('/launch');
    const current = siteState.getState().event;

    if ((activate || start) && current.active) {
      throw new Error('L’événement est déjà actif.');
    }

    if ((launch || url.pathname.endsWith('/end')) && !current.active) {
      throw new Error('L’événement n’est pas actif.');
    }

    if ((activate || start) && current.snapshot) {
      throw new Error('Une ancienne sauvegarde Jax existe encore. Restaure-la avant de redémarrer.');
    }

    // Activation depuis le bouton du site :
    // aucun message Discord n'est envoyé.
    if (activate) {
      siteState.setEvent({
        active: true,
        startedAt: Date.now(),
        endedAt: null,
        stage: 'accueil',
        fragments: [],
        fragmentsUnlocked: false,
        luckyCharmUnlocked: false,
        fragmentsComplete: false,
        contextSent: false,
        launchSent: false,
        players: {},
        jaxUserId: null,
        jaxUsername: null,
        jaxAkumatizedAt: null,
        snapshot: null,
        createdChannels: [],
        changedByJax: []
      });

      siteState.addLog(
        '🎪 Événement Digital Circus × Miraculous activé depuis le site.',
        true,
        'event'
      );

      return json(res, 200, {
        ok: true,
        message: 'Événement activé !',
        event: siteState.getState().event
      });
    }

    const defaultMessage = launch
      ? '🎪 **Le cirque est officiellement ouvert !** Ladybug et Chat Noir sont désormais parmi vous. Mais quelque chose se prépare dans les coulisses… Gardez l’œil ouvert : chaque indice comptera.'
      : start
        ? '🎪 **Une faille entre deux mondes…** Ladybug et Chat Noir viennent d’être transportés dans le Digital Circus. Caine les accueille dans son univers, mais une présence mystérieuse observe déjà les nouveaux arrivants. Le spectacle ne fait que commencer…'
        : '🛑 **L’événement Digital Circus × Miraculous est terminé.** Le cirque retrouve son calme. Les systèmes habituels d’Akuma et d’Amok restent disponibles.';

    const message = String(body.message || defaultMessage).trim().slice(0, 1800);

    if (body.channelId) {
      const channel = await guild.channels.fetch(String(body.channelId));
      if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') {
        throw new Error('Salon d’annonce introuvable.');
      }
      await channel.send({ content: message, allowedMentions: { parse: [] } });
    }

    if (start) {
      siteState.setEvent({
        active: true, startedAt: Date.now(), endedAt: null, stage: 'accueil',
        fragments: [], fragmentsUnlocked: false, luckyCharmUnlocked: false,
        fragmentsComplete: false, contextSent: Boolean(body.channelId), launchSent: false,
        players: {}, jaxUserId: null, snapshot: null, createdChannels: [], changedByJax: []
      });
      siteState.addLog('🎪 Événement Digital Circus × Miraculous démarré : contexte envoyé.', true, 'event');
    } else if (launch) {
      siteState.setEvent({ launchSent: Boolean(body.channelId) || current.launchSent });
      siteState.addLog('🎪 Message de lancement publié séparément.', true, 'event');
    } else {
      siteState.setEvent({ active: false, endedAt: Date.now(), stage: 'arrêté', fragmentsUnlocked: false, luckyCharmUnlocked: false });
      siteState.addLog('🎪 Événement arrêté manuellement.', true, 'event');
    }

    return json(res, 200, { ok: true, event: siteState.getState().event });
  }

  return json(res, 404, {
    error: 'Action inconnue.'
  });
}

// ==================================================
// EXPIRATION DES AKUMATISATIONS
// ==================================================

async function sweepExpiredAkumas() {
  if (!client || !client.isReady()) return;

  const current = siteState.getState() || {};
  const akumas = current.akuma &&
    typeof current.akuma === 'object' &&
    !Array.isArray(current.akuma)
      ? current.akuma
      : {};
  const now = Date.now();

  // L'état peut ne pas encore contenir la propriété "akuma"
  // (ancienne sauvegarde ou état initial). Dans ce cas,
  // le nettoyage attendra le prochain cycle au lieu de faire
  // planter tout le serveur.
  for (const [key, entry] of Object.entries(akumas)) {
    if (!entry || !entry.endsAt || entry.endsAt > now) {
      continue;
    }

    const [guildId, userId] = key.split(':');

    try {
      const guild = await getGuild(guildId);

      const member = await guild.members
        .fetch(userId)
        .catch(() => null);

      if (member) {
        const role = guild.roles.cache.find(
          r => r.name === ROLE_NAME
        );

        if (
          role &&
          member.roles.cache.has(role.id)
        ) {
          await member.roles.remove(
            role,
            'Fin de durée de l’akumatisation'
          );
        }

        for (const r of member.roles.cache.values()) {
          if (r.name.startsWith('Amok · ')) {
            await member.roles.remove(
              r,
              'Fin de durée de l’akumatisation'
            );
          }
        }

        if (
          entry.originalNick !== undefined &&
          member.manageable &&
          (member.nickname || null) !==
            (entry.originalNick || null)
        ) {
          await member.setNickname(
            entry.originalNick || null,
            'Fin de durée'
          ).catch(() => {});
        }

        if (
          entry.jaxChaos ||
          entry.powerKey === 'jax-chaos'
        ) {
          try {
            await jaxChaos.restoreServer(guild);

            siteState.setEvent({
              active: false,
              endedAt: Date.now(),
              stage: 'terminé',
              fragmentsUnlocked: false
            });
          } catch (error) {
            siteState.addLog(
              `⚠️ Restauration Jax après expiration : ${error.message}`,
              false,
              'repair-error'
            );
          }
        }

        siteState.recordPurification(
          guildId,
          userId,
          member.displayName,
          'Fin de durée'
        );

      } else {
        siteState.removeAkuma(guildId, userId);
      }

    } catch (error) {
      console.error(
        '[panneau] expiration akuma :',
        error.message
      );
    }
  }
}

// ==================================================
// LANCEMENT DU SERVEUR
// ==================================================

const server = http.createServer((req, res) => {
  route(req, res).catch(error => {
    console.error('[panneau]', error);

    if (!res.headersSent) {
      json(res, 400, {
        error: error.message || 'Erreur interne.'
      });
    } else {
      res.end();
    }
  });
});

setInterval(
  sweepExpiredAkumas,
  30 * 1000
).unref();

server.listen(PORT, () => {
  console.log(
    `API du panneau prête sur le port ${PORT}`
  );

  if (!PASSWORD) {
    console.warn(
      '⚠️ Configure PANEL_PASSWORD dans les variables d’environnement.'
    );
  }

  if (!ALLOWED.length) {
    console.warn(
      '⚠️ Configure ALLOWED_ORIGIN avec l’adresse exacte de GitHub Pages.'
    );
  }
});
