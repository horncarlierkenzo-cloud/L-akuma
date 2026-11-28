
'use strict';

const http = require('http');
const crypto = require('crypto');

if (!process.env.DISCORD_TOKEN) {
  throw new Error('DISCORD_TOKEN doit être configuré sur Render.');
}

const client = require('./index.js');
const { EmbedBuilder } = require('discord.js');

const base = require('./powers');
const extra = require('./powers-extra');
const siteState = require('./site-state');
const jaxChaos = require('./jax-chaos');

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

const AMOKS = {
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

const FRAGMENTS = [
  'Fragment du chapiteau',
  'Fragment du masque',
  'Fragment du projecteur',
  'Fragment du portail'
];

// ==================================================
// OUTILS HTTP
// ==================================================

function json(res, status, value, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });

  res.end(JSON.stringify(value));
}

function cors(req, res) {
  const origin = String(req.headers.origin || '')
    .trim()
    .replace(/\/+$/, '')
    .toLowerCase();

  if (origin && ALLOWED.length && !ALLOWED.includes(origin)) {
    return false;
  }

  if (origin && ALLOWED.includes(origin)) {
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

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// ==================================================
// AUTHENTIFICATION
// ==================================================

function authenticated(req) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : '';

  const session = sessions.get(token);

  if (!session || session.expires < Date.now()) {
    if (session) sessions.delete(token);
    return false;
  }

  session.expires = Date.now() + SESSION_TTL;
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
    throw new Error('Le bot Discord n’est pas encore connecté.');
  }

  return client.guilds.cache.get(id) ||
    await client.guilds.fetch(id);
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
      reason: 'Panneau Papillon Ombre'
    });
  }

  if (!role.editable) {
    throw new Error(
      `Le rôle « ${name} » doit être placé sous le rôle du bot.`
    );
  }

  return role;
}

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

async function getTextChannel(guild, channelId, errorMessage) {
  if (!channelId) {
    throw new Error('Choisis un salon Discord.');
  }

  const channel = await guild.channels.fetch(String(channelId));

  if (
    !channel ||
    !channel.isTextBased() ||
    typeof channel.send !== 'function'
  ) {
    throw new Error(errorMessage || 'Salon introuvable.');
  }

  return channel;
}

// ==================================================
// AKUMATISATION DE JAX CHAOS
// ==================================================

async function akumatizeJax(guild, member, body, guildId) {
  const event = siteState.getState().event;

  if (!event.active) {
    throw new Error('Active l’événement avant d’akumatiser Jax Chaos.');
  }

  if (member.roles.cache.some(r => r.name === ROLE_NAME)) {
    throw new Error('Ce membre est déjà akumatisé.');
  }

  const emotion = String(body.emotion || 'Chaos').slice(0, 80);

  const role = await ensureRole(guild, ROLE_NAME);

  const dmText = String(
    body.dm ||
    '🦋 Jax… ton esprit est rempli de chaos. Je t’offre le pouvoir de bouleverser ce cirque. Tu es désormais Jax Chaos ! Utilise **/jax** pour ouvrir ton panneau privé.'
  ).slice(0, 3500);

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

  await member.roles.add(role, 'Akumatisation spéciale Jax Chaos');

  siteState.setAkuma(guildId, member.id, {
    name: member.displayName,
    emotion,
    power: 'Jax Chaos',
    powerKey: 'jax-chaos',
    jaxChaos: true,
    originalNick: member.nickname,
    startedAt: Date.now(),
    endsAt: Number(body.durationMin) > 0
      ? Date.now() + Math.min(10080, Number(body.durationMin)) * 60000
      : null,
    amok: null
  });

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
      fill(body.nickFormat || '🐰 Jax Chaos · {name}', {
        name: member.displayName
      }).slice(0, 32),
      'Akumatisation Jax Chaos'
    ).catch(() => {});
  }

  if (body.channelId) {
    const channel = await getTextChannel(
      guild,
      body.channelId,
      'Salon d’annonce introuvable.'
    );

    await channel.send({
      content: fill(
        body.announcement ||
        '🦋 **ALERTE ! Jax vient d’être akumatisé en Jax Chaos !** Le chaos envahit le cirque. Les fragments du Lucky Charm sont maintenant accessibles !',
        {
          user: `<@${member.id}>`,
          name: member.displayName,
          emotion,
          power: 'Jax Chaos'
        }
      ).slice(0, 1900),
      allowedMentions: { users: [member.id] }
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
// ROUTES
// ==================================================

async function route(req, res) {
  if (!cors(req, res)) {
    return json(res, 403, { error: 'Origine non autorisée.' });
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/') {
    return json(res, 200, {
      ok: true,
      service: 'Panneau Papillon Ombre',
      botReady: Boolean(client && client.isReady())
    });
  }

  // CONNEXION
  if (req.method === 'POST' && url.pathname === '/api/login') {
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
    const supplied = Buffer.from(String(body.password || ''));
    const expected = Buffer.from(PASSWORD);

    const valid =
      supplied.length === expected.length &&
      crypto.timingSafeEqual(supplied, expected);

    if (!valid) {
      attempt.count++;
      loginAttempts.set(ip, attempt);
      return json(res, 401, { error: 'Mot de passe incorrect.' });
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
    return json(res, 404, { error: 'Route inconnue.' });
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

  // ÉTAT
  if (req.method === 'GET' && url.pathname === '/api/state') {
    const state = siteState.getState();

    return json(res, 200, {
      guild: { id: guild.id, name: guild.name },
      bot: client.user.username,
      event: state.event,
      purifications: state.purifications
        .filter(x => x.guildId === guildId)
        .slice(0, 60),
      logs: state.logs.slice(0, 80)
    });
  }

  // MEMBRES
  if (req.method === 'GET' && url.pathname === '/api/members') {
    await guild.members.fetch();

    const members = [...guild.members.cache.values()]
      .filter(m => !m.user.bot)
      .map(m => ({
        id: m.id,
        username: m.user.username,
        name: m.displayName,
        avatar: m.displayAvatarURL({ size: 64 }),
        akuma: m.roles.cache.some(r => r.name === ROLE_NAME),
        amoks: m.roles.cache
          .filter(r => r.name.startsWith('Amok · '))
          .map(r => r.name.slice(7)),
        manageable: m.manageable
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

    return json(res, 200, { members });
  }

  // SALONS
  if (req.method === 'GET' && url.pathname === '/api/channels') {
    const channels = [...guild.channels.cache.values()]
      .filter(c => c.isTextBased() && typeof c.send === 'function')
      .map(c => ({ id: c.id, name: c.name, type: c.type }));

    return json(res, 200, { channels });
  }

  // JOURNAL
  if (req.method === 'GET' && url.pathname === '/api/logs') {
    const state = siteState.getState();

    return json(res, 200, {
      logs: state.logs,
      purifications: state.purifications.filter(
        x => x.guildId === guildId
      )
    });
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Méthode non autorisée.' });
  }

  // MESSAGE PRIVÉ
  if (url.pathname === '/api/dm') {
    const member = await getMember(guild, body.userId);
    const message = String(body.message || '').trim();

    if (!message) throw new Error('Écris un message privé.');

    await sendPrivate(member, message, null);

    siteState.addLog(
      `✉️ Message privé envoyé à ${member.displayName}.`,
      true,
      'message'
    );

    return json(res, 200, { ok: true });
  }

  // AKUMATISATION
  if (url.pathname === '/api/akumatize') {
    const member = await getMember(guild, body.userId);

    if (String(body.powerKey) === 'jax-chaos') {
      const result = await akumatizeJax(
        guild, member, body, guildId
      );

      return json(res, 200, result);
    }

    if (member.roles.cache.some(r => r.name === ROLE_NAME)) {
      throw new Error('Ce membre est déjà akumatisé.');
    }

    const emotion = String(body.emotion || 'Mystère').slice(0, 80);
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
        ? Date.now() + Math.min(10080, Number(body.durationMin)) * 60000
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
    await member.roles.add(role, 'Akumatisation depuis le panneau web');

    if (body.changeNick) {
      await member.setNickname(
        fill(body.nickFormat || '🦋 {name}', {
          name: member.displayName
        }).slice(0, 32),
        'Akumatisation'
      );
    }

    siteState.setAkuma(guildId, member.id, entry);

    if (body.channelId) {
      const channel = await getTextChannel(
        guild,
        body.channelId,
        'Salon d’annonce introuvable.'
      );

      await channel.send({
        content: fill(
          body.announcement ||
          '🦋 {user} a été akumatisé(e) ! Émotion : {emotion}. Pouvoir : {power}.',
          {
            user: `<@${member.id}>`,
            name: member.displayName,
            emotion,
            power: power ? power.label : 'aucun'
          }
        ).slice(0, 1900),
        allowedMentions: { users: [member.id] }
      });
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

  // PURIFICATION
  if (url.pathname === '/api/purify') {
    const member = await getMember(guild, body.userId);
    const role = guild.roles.cache.find(r => r.name === ROLE_NAME);

    if (!role || !member.roles.cache.has(role.id)) {
      throw new Error('Ce membre ne possède pas le rôle Akumatisé.');
    }

    const old = siteState.getState().akuma[
      `${guildId}:${member.id}`
    ];

    if (old && (old.jaxChaos || old.powerKey === 'jax-chaos')) {
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

    await member.roles.remove(role, 'Purification depuis le panneau');

    for (const r of member.roles.cache.values()) {
      if (r.name.startsWith('Amok · ')) {
        await member.roles.remove(r, 'Purification');
      }
    }

    if (
      old &&
      member.manageable &&
      (member.nickname || null) !== (old.originalNick || null)
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

  // ATTRIBUTION AMOK
  if (url.pathname === '/api/amok') {
    const member = await getMember(guild, body.userId);

    if (!member.roles.cache.some(r => r.name === ROLE_NAME)) {
      throw new Error('Akumatise d’abord ce membre.');
    }

    const amokKey = String(body.amokKey || '');
    if (!AMOKS[amokKey]) {
      throw new Error('Choisis un Amok valide.');
    }

    if (member.roles.cache.some(r => r.name.startsWith('Amok · '))) {
      throw new Error('Ce membre possède déjà un Amok.');
    }

    const role = await ensureRole(
      guild,
      `Amok · ${AMOKS[amokKey]}`,
      0xe0457b
    );

    await member.roles.add(role, 'Amok attribué depuis le panneau');

    const state = siteState.getState();
    const entry = state.akuma[`${guildId}:${member.id}`] || {
      name: member.displayName,
      startedAt: Date.now()
    };

    entry.amok = amokKey;
    siteState.setAkuma(guildId, member.id, entry);

    siteState.addLog(
      `🪶 ${member.displayName} reçoit Amok · ${AMOKS[amokKey]}.`,
      true,
      'amok'
    );

    return json(res, 200, { ok: true });
  }

  // RETRAIT AMOK
  if (url.pathname === '/api/unamok') {
    const member = await getMember(guild, body.userId);
    const roles = member.roles.cache.filter(
      r => r.name.startsWith('Amok · ')
    );

    if (!roles.size) {
      throw new Error('Ce membre ne possède aucun Amok.');
    }

    for (const role of roles.values()) {
      await member.roles.remove(role, 'Amok retiré depuis le panneau');
    }

    const state = siteState.getState();
    const entry = state.akuma[`${guildId}:${member.id}`];

    if (entry) {
      delete entry.amok;
      siteState.setAkuma(guildId, member.id, entry);
    }

    siteState.addLog(
      `🪶 Amok retiré à ${member.displayName}.`,
      true,
      'amok'
    );

    return json(res, 200, { ok: true });
  }

  // ==================================================
  // ÉVÉNEMENT : ACTIVATION SANS MESSAGE
  // ==================================================

  if (url.pathname === '/api/event/activate') {
    const current = siteState.getState().event;

    if (current.active) {
      throw new Error('L’événement est déjà actif.');
    }

    if (current.snapshot) {
      throw new Error(
        'Une ancienne sauvegarde Jax existe encore. Restaure-la avant de redémarrer.'
      );
    }

    siteState.setEvent({
      active: true,
      startedAt: Date.now(),
      endedAt: null,
      stage: 'accueil',
      fragments: [],
      fragmentsUnlocked: false,
      fragmentsComplete: false,
      luckyCharmUnlocked: false,
      contextSent: false,
      launchSent: false,
      players: {},
      jaxUserId: null,
      snapshot: null,
      createdChannels: [],
      changedByJax: []
    });

    siteState.addLog(
      '🎪 Événement activé. Aucun message Discord publié.',
      true,
      'event'
    );

    return json(res, 200, {
      ok: true,
      event: siteState.getState().event
    });
  }

  // ==================================================
  // ÉVÉNEMENT : ENVOI DU CONTEXTE
  // ==================================================

  if (url.pathname === '/api/event/context') {
    const current = siteState.getState().event;

    if (!current.active) {
      throw new Error('Active d’abord l’événement.');
    }

    if (current.contextSent) {
      throw new Error('Le contexte a déjà été envoyé.');
    }

    const channel = await getTextChannel(
      guild,
      body.channelId,
      'Salon de contexte introuvable.'
    );

    const defaultContext = `🎪 **UNE FAILLE ENTRE DEUX MONDES…**

La journée semblait enfin terminée à Paris. Après une nouvelle intervention, Ladybug et Chat Noir s’apprêtaient à rentrer chez eux. Soudain, une étrange lumière apparut dans le ciel. Une faille numérique s’ouvrit devant eux et les aspira avant qu’ils puissent réagir.

Lorsqu’ils reprirent leurs esprits, ils découvrirent un univers totalement différent : des décors colorés, des lumières irréelles et des couloirs qui semblaient changer de forme. Une voix joyeuse retentit alors. Caine venait de découvrir deux invités inattendus dans son cirque numérique !

Il leur souhaita la bienvenue et leur expliqua qu’ils étaient désormais dans son incroyable spectacle. Mais Ladybug et Chat Noir comprirent rapidement que quelque chose clochait. Au loin, une présence mystérieuse observait leur arrivée. Papillon Ombre avait repéré les deux héros et cherchait déjà un moyen de profiter de cette situation.

Dans les coulisses, Jax semblait particulièrement intéressé par ces nouveaux visiteurs… Pour retrouver leur chemin et comprendre ce qui se passe, Ladybug et Chat Noir devront découvrir les secrets du cirque.

Quatre fragments mystérieux devront être retrouvés. Mais attention : le Lucky Charm restera verrouillé tant que les quatre fragments n’auront pas été réunis.

**Le spectacle peut commencer…**`;

    await channel.send({
      content: String(body.message || defaultContext)
        .trim()
        .slice(0, 1900),
      allowedMentions: { parse: [] }
    });

    siteState.setEvent({ contextSent: true });

    siteState.addLog(
      '📖 Le contexte de l’événement a été publié.',
      true,
      'event'
    );

    return json(res, 200, {
      ok: true,
      event: siteState.getState().event
    });
  }

  // ==================================================
  // ÉVÉNEMENT : FRAGMENTS DU LUCKY CHARM
  // ==================================================

  if (url.pathname === '/api/event/fragment') {
    const current = siteState.getState().event;

    if (!current.active) {
      throw new Error('L’événement n’est pas actif.');
    }

    if (!current.fragmentsUnlocked) {
      throw new Error(
        'Les fragments sont verrouillés jusqu’à l’akumatisation de Jax Chaos.'
      );
    }

    const member = await getMember(guild, body.userId);
    const fragment = String(body.fragment || '').trim();

    if (!FRAGMENTS.includes(fragment)) {
      throw new Error('Choisis un fragment valide.');
    }

    const progress = siteState.addFragment(
      guildId,
      member.id,
      String(body.character || 'Participant'),
      fragment
    );

    if (!progress.ok) {
      throw new Error(
        progress.reason || 'Impossible d’enregistrer ce fragment.'
      );
    }

    const channel = await getTextChannel(
      guild,
      body.channelId,
      'Salon d’annonce du fragment introuvable.'
    );

    const announcement = progress.complete
      ? `🐞✨ **${fragment}** a été récupéré par **${member.displayName}** ! Les quatre fragments sont réunis : le **Lucky Charm est maintenant débloqué** !`
      : `🎟️ **${member.displayName}** a retrouvé : **${fragment}** ! Progression du Lucky Charm : **${progress.count}/4** fragments.`;

    await channel.send({
      content: announcement,
      allowedMentions: { parse: [] }
    });

    return json(res, 200, {
      ok: true,
      progress,
      event: siteState.getState().event
    });
  }

  // ==================================================
  // ÉVÉNEMENT : LANCEMENT OFFICIEL
  // ==================================================

  if (url.pathname === '/api/event/launch') {
    const current = siteState.getState().event;

    if (!current.active) {
      throw new Error('L’événement n’est pas actif.');
    }

    const channel = await getTextChannel(
      guild,
      body.channelId,
      'Salon de lancement introuvable.'
    );

    const message = String(
      body.message ||
      '🎪 **LE CIRQUE N’EST PLUS AUSSI ACCUEILLANT…**\n\nLes portes du cirque viennent de s’ouvrir à deux visiteurs inattendus. Caine a désormais deux nouveaux invités à présenter aux habitants : Ladybug et Chat Noir !\n\nMais pendant que les présentations commencent, une étrange énergie se propage dans les coulisses… Quelqu’un prépare quelque chose.\n\n🐰 Jax semble particulièrement intéressé par cette situation.\n🦋 Une présence mystérieuse observe déjà la scène…\n\nRestez attentifs. Le moindre indice pourrait devenir essentiel.'
    ).trim().slice(0, 1900);

    await channel.send({
      content: message,
      allowedMentions: { parse: [] }
    });

    siteState.setEvent({ launchSent: true });

    siteState.addLog(
      '🎪 Message de lancement officiel publié.',
      true,
      'event'
    );

    return json(res, 200, {
      ok: true,
      event: siteState.getState().event
    });
  }

  // ==================================================
  // ÉVÉNEMENT : ARRÊT
  // ==================================================

  if (url.pathname === '/api/event/end') {
    const current = siteState.getState().event;

    if (!current.active) {
      throw new Error('L’événement n’est pas actif.');
    }

    if (body.channelId) {
      const channel = await getTextChannel(
        guild,
        body.channelId,
        'Salon de fin d’événement introuvable.'
      );

      await channel.send({
        content: String(
          body.message ||
          '🐞✨ L’événement Digital Circus × Miraculous est terminé. Le cirque retrouve son calme !'
        ).slice(0, 1900),
        allowedMentions: { parse: [] }
      });
    }

    siteState.setEvent({
      active: false,
      endedAt: Date.now(),
      stage: 'terminé',
      fragmentsUnlocked: false
    });

    siteState.addLog(
      '🎪 Événement arrêté manuellement.',
      true,
      'event'
    );

    return json(res, 200, {
      ok: true,
      event: siteState.getState().event
    });
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

  const state = siteState.getState() || {};
  const akumas = state.akuma &&
    typeof state.akuma === 'object' &&
    !Array.isArray(state.akuma)
      ? state.akuma
      : {};

  const now = Date.now();

  for (const [key, entry] of Object.entries(akumas)) {
    if (!entry || !entry.endsAt || entry.endsAt > now) {
      continue;
    }

    const [guildId, userId] = key.split(':');

    try {
      const guild = await getGuild(guildId);
      const member = await guild.members.fetch(userId).catch(() => null);

      if (!member) {
        siteState.removeAkuma(guildId, userId);
        continue;
      }

      const role = guild.roles.cache.find(r => r.name === ROLE_NAME);

      if (role && member.roles.cache.has(role.id)) {
        await member.roles.remove(
          role,
          'Fin de durée de l’akumatisation'
        );
      }

      for (const r of member.roles.cache.values()) {
        if (r.name.startsWith('Amok · ')) {
          await member.roles.remove(r, 'Fin de durée');
        }
      }

      if (
        entry.originalNick !== undefined &&
        member.manageable &&
        (member.nickname || null) !== (entry.originalNick || null)
      ) {
        await member.setNickname(
          entry.originalNick || null,
          'Fin de durée'
        ).catch(() => {});
      }

      if (entry.jaxChaos || entry.powerKey === 'jax-chaos') {
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

    } catch (error) {
      console.error('[panneau] expiration akuma :', error.message);
    }
  }
}

// ==================================================
// DÉMARRAGE DU SERVEUR
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

setInterval(sweepExpiredAkumas, 30 * 1000).unref();

server.listen(PORT, () => {
  console.log(`API du panneau prête sur le port ${PORT}`);

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
