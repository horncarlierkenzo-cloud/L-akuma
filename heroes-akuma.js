// heroes-akuma.js — Règles « akuma » pour les héros (ajout, ne modifie aucun fichier existant)
//  1) Les pouvoirs d'Amalgame (kwamis) ne peuvent viser que des Akumatisés
//  2) Les pouvoirs des héros ne peuvent viser que l'akuma (sauf Carapace : dôme inchangé)
//  3) Miraculous Ladybug répare TOUT (dégâts de l'akuma ET des héros), rend les anciens pseudos
//     et désakumatise (retire le rôle Akumatisé)
//
// Branchement : dans index.js, juste après `heroes.registerEvents(client);` ajoute :
//   require('./heroes-akuma').install(client);
'use strict';

const { GuildMember, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const heroes = require('./heroes');
const base = require('./powers');
const extra = require('./powers-extra');

const { shields } = base;
const { effects } = extra;

const ROLE_NAME = process.env.AKUMA_ROLE || 'Akumatisé';
const WINDOW = 2 * 60 * 60 * 1000; // les dégâts des 2 dernières heures sont réparables

/* ───────────────────────── OUTILS ───────────────────────── */

const isAkuma = (m) => !!m && m.roles.cache.some((r) => r.name === ROLE_NAME);
// force:true car sans l'intent « Membres » le cache des rôles peut être périmé
const fresh = (guild, id) => guild.members.fetch({ user: id, force: true }).catch(() => null);

async function say(channel, content) {
  try { await channel.send({ content, allowedMentions: { parse: [] } }); } catch { /* ignore */ }
}

// Exécute les actions d'un même salon l'une après l'autre
const chain = new Map();
function serial(id, fn) {
  const prev = chain.get(id) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  chain.set(id, next);
  return next;
}

/* ───────────────────────── JOURNAL DES DÉGÂTS ───────────────────────── */

const msgLog = new Map();       // channelId -> [{ id, tag, content, ts, deleted, restored }]
const nickLog = new Map();      // guildId:userId -> { orig, ts } (pseudo d'AVANT le premier changement)
const chanChanges = new Map();  // channelId -> { name, topic, rate, send, ts } (état d'AVANT)
const chanRemoved = new Map();  // channelId -> { guildId, ts, data } (salons supprimés)
const summaries = new Map();    // guildId -> texte du dernier bilan de réparation

// Droit « écrire » de @everyone dans un salon : true / false / null (non défini)
const sendState = (c) => {
  const ow = c.permissionOverwrites && c.permissionOverwrites.cache.get(c.guild.id);
  if (!ow) return null;
  return ow.deny.has(PermissionFlagsBits.SendMessages) ? false : ow.allow.has(PermissionFlagsBits.SendMessages) ? true : null;
};

// Pseudos : on retient le pseudo d'avant chaque changement fait par le bot (Ziggy, Émotion, Mélodie, Farce…)
const origSetNickname = GuildMember.prototype.setNickname;
let nickPatched = false;
function patchNicknames() {
  if (nickPatched) return;
  nickPatched = true;
  GuildMember.prototype.setNickname = function (nick, reason) {
    try {
      const key = `${this.guild.id}:${this.id}`;
      const cur = nickLog.get(key);
      const next = nick || null;
      if (cur && Date.now() - cur.ts < WINDOW) {
        if (next === cur.orig) nickLog.delete(key); // le pseudo d'origine est revenu
      } else if ((this.nickname || null) !== next) {
        nickLog.set(key, { orig: this.nickname || null, ts: Date.now() });
      }
    } catch { /* ignore */ }
    return origSetNickname.call(this, nick, reason);
  };
}

const snapshot = (c) => ({
  name: c.name,
  type: c.type,
  parent: c.parentId || undefined,
  position: c.rawPosition,
  topic: c.topic || undefined,
  nsfw: c.nsfw || undefined,
  rateLimitPerUser: c.rateLimitPerUser || undefined,
  bitrate: c.bitrate || undefined,
  userLimit: c.userLimit || undefined,
  permissionOverwrites: c.permissionOverwrites
    ? c.permissionOverwrites.cache.map((o) => ({ id: o.id, type: o.type, allow: o.allow, deny: o.deny }))
    : undefined,
});

function trackEvents(client) {
  client.on('messageCreate', (m) => {
    if (!m.guild || !m.content) return;
    const a = msgLog.get(m.channelId) || [];
    // Message restauré par le bot : on le note pour ne pas le restaurer deux fois
    if (m.author.id === client.user.id) {
      if (m.content.startsWith('⏪ **')) {
        for (const e of a) if (`⏪ **${e.tag}** : ${e.content}`.slice(0, 1900) === m.content) e.restored = true;
      }
      return;
    }
    if (m.author.bot) return;
    a.push({ id: m.id, tag: m.author.username, content: m.content, ts: m.createdTimestamp, deleted: false, restored: false });
    if (a.length > 200) a.shift();
    msgLog.set(m.channelId, a);
  });

  const markDeleted = (channelId, ids) => {
    const a = msgLog.get(channelId);
    if (!a) return;
    for (const e of a) if (ids.includes(e.id)) e.deleted = true;
  };
  client.on('messageDelete', (m) => markDeleted(m.channelId, [m.id]));
  client.on('messageDeleteBulk', (ms) => {
    const first = ms.first();
    if (first) markDeleted(first.channelId, [...ms.keys()]);
  });

  // Salon renommé / sujet changé / mode lent : on garde l'état d'avant
  client.on('channelUpdate', (o, n) => {
    if (!n.guild || (n.isThread && n.isThread())) return;
    if (o.name === n.name && o.topic === n.topic && o.rateLimitPerUser === n.rateLimitPerUser && sendState(o) === sendState(n)) return;
    const prev = chanChanges.get(n.id);
    if (prev && Date.now() - prev.ts < WINDOW) return; // on garde le plus ancien (= avant les dégâts)
    chanChanges.set(n.id, { name: o.name, topic: o.topic || null, rate: o.rateLimitPerUser || 0, send: sendState(o), ts: Date.now() });
  });

  // Salon supprimé (on ignore les faux salons de Rena Rouge et le terrier de Bunnyx)
  client.on('channelDelete', (c) => {
    if (!c.guild || (c.isThread && c.isThread())) return;
    if (c.name.startsWith('terrier-de-bunnyx')) return;
    const twin = c.guild.channels.cache.some((x) => x.id !== c.id && x.name === c.name && x.type === c.type);
    if (twin) return; // un salon identique existe encore : c'est un faux salon
    chanRemoved.set(c.id, { guildId: c.guild.id, ts: Date.now(), data: snapshot(c) });
    chanChanges.delete(c.id);
  });
}

/* ───────────────────────── 3) RÉPARATION (Miraculous Ladybug) ───────────────────────── */
// Appelée par heroes.js (hooks.repair) en plus de ce que Miraculous Ladybug faisait déjà
// (akumas bloqués, amoks incontrôlables, venin, mute/sourd, émotions).

async function repair(guild) {
  const cutoff = Date.now() - WINDOW;
  const n = { effects: 0, shields: 0, timeouts: 0, voice: 0, msgs: 0, chans: 0, fixed: 0, nicks: 0, purified: 0 };

  // Désakumatisation : tout le monde perd le rôle Akumatisé
  const role = guild.roles.cache.find((r) => r.name === ROLE_NAME);
  if (role) {
    // Sans l'intent « Server Members », on ne voit que les membres déjà connus du bot
    if (guild.client.options.intents.has(GatewayIntentBits.GuildMembers)) await guild.members.fetch().catch(() => {});
    for (const m of [...role.members.values()]) {
      if (await m.roles.remove(role, 'Miraculous Ladybug').then(() => true).catch(() => false)) n.purified++;
    }
  }

  // Effets de pouvoirs d'akuma (Mime, Simon Says, Copycat, Oblivio…) et boucliers de pierre
  n.shields = shields.size;
  shields.clear();
  for (const m of Object.values(effects)) {
    if (m && typeof m.clear === 'function') { n.effects += m.size || 0; m.clear(); }
  }

  // Membres figés (timeout)
  for (const m of guild.members.cache.values()) {
    if (m.isCommunicationDisabled && m.isCommunicationDisabled()) {
      if (await m.timeout(null, 'Miraculous Ladybug').then(() => true).catch(() => false)) n.timeouts++;
    }
  }

  // Membres en sourdine / sourds (vocal)
  for (const vs of guild.voiceStates.cache.values()) {
    if (!vs.channelId) continue;
    if (vs.serverMute && await vs.setMute(false, 'Miraculous Ladybug').then(() => true).catch(() => false)) n.voice++;
    if (vs.serverDeaf && await vs.setDeaf(false, 'Miraculous Ladybug').then(() => true).catch(() => false)) n.voice++;
  }

  // Salons supprimés → recréés
  for (const [id, c] of [...chanRemoved]) {
    if (c.guildId !== guild.id) continue;
    chanRemoved.delete(id);
    if (c.ts < cutoff) continue;
    const made = await guild.channels.create({ ...c.data, reason: 'Miraculous Ladybug' }).catch(() => null);
    if (made) n.chans++;
  }

  // Salons renommés / sujet / mode lent → remis comme avant
  for (const [id, c] of [...chanChanges]) {
    const ch = guild.channels.cache.get(id);
    if (!ch) continue;
    chanChanges.delete(id);
    if (c.ts < cutoff) continue;
    let touched = false;
    if (ch.name !== c.name && await ch.setName(c.name, 'Miraculous Ladybug').then(() => true).catch(() => false)) touched = true;
    if ('topic' in ch && (ch.topic || null) !== c.topic && await ch.setTopic(c.topic, 'Miraculous Ladybug').then(() => true).catch(() => false)) touched = true;
    if ('rateLimitPerUser' in ch && (ch.rateLimitPerUser || 0) !== c.rate && await ch.setRateLimitPerUser(c.rate, 'Miraculous Ladybug').then(() => true).catch(() => false)) touched = true;
    // Salon figé (droit d'écrire de @everyone retiré) → rétabli
    if (c.send !== undefined && ch.permissionOverwrites && sendState(ch) !== c.send
      && await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: c.send }, { reason: 'Miraculous Ladybug' }).then(() => true).catch(() => false)) touched = true;
    if (touched) n.fixed++;
  }

  // Messages supprimés → restaurés (hors suppressions faites par un héros)
  let budget = 40;
  for (const [chId, list] of msgLog) {
    if (budget <= 0) break;
    const ch = guild.channels.cache.get(chId);
    if (!ch || !ch.isTextBased()) continue;
    const lost = list.filter((e) => e.deleted && !e.restored && e.ts >= cutoff).slice(0, budget);
    for (const e of lost) {
      e.restored = true;
      budget--;
      if (await ch.send({ content: `⏪ **${e.tag}** : ${e.content}`.slice(0, 1900), allowedMentions: { parse: [] } }).then(() => true).catch(() => false)) n.msgs++;
    }
  }

  // Pseudos → remis comme avant (on appelle la vraie fonction pour ne pas re-enregistrer le retour)
  for (const [nk, rec] of [...nickLog]) {
    if (!nk.startsWith(`${guild.id}:`)) continue;
    nickLog.delete(nk);
    if (rec.ts < cutoff) continue;
    const m = await guild.members.fetch(nk.split(':')[1]).catch(() => null);
    if (m && m.manageable && (m.nickname || null) !== rec.orig
      && await origSetNickname.call(m, rec.orig, 'Miraculous Ladybug').then(() => true).catch(() => false)) n.nicks++;
  }

  const parts = [];
  if (n.purified) parts.push(`${n.purified} membre(s) désakumatisé(s)`);
  if (n.nicks) parts.push(`${n.nicks} pseudo(s) rendu(s)`);
  if (n.msgs) parts.push(`${n.msgs} message(s) restauré(s)`);
  if (n.chans) parts.push(`${n.chans} salon(s) recréé(s)`);
  if (n.fixed) parts.push(`${n.fixed} salon(s) remis en état`);
  if (n.timeouts) parts.push(`${n.timeouts} membre(s) dégelé(s)`);
  if (n.voice) parts.push(`${n.voice} membre(s) en vocal rétabli(s)`);
  if (n.effects) parts.push(`${n.effects} effet(s) de pouvoir annulé(s)`);
  if (n.shields) parts.push(`${n.shields} bouclier(s) de pierre brisé(s)`);
  summaries.set(guild.id, parts.length ? parts.join(' • ') : 'aucun dégât restant à réparer');
}

/* ───────────────────────── 1 & 2) CIBLES = AKUMATISÉS UNIQUEMENT ───────────────────────── */

// Retourne true si l'interaction a été entièrement traitée ici
async function filterTargets(i, step, extraId) {
  const members = await Promise.all(i.values.map((id) => fresh(i.guild, id)));
  const targets = members.filter(isAkuma);

  if (!targets.length) {
    await i.update({
      content: `🦋 Cible refusée : seuls les membres avec le rôle « ${ROLE_NAME} » peuvent être visés.`,
      components: [],
    });
    return true;
  }
  i.values = targets.map((m) => m.id); // heroes.js ne verra que les akumatisés

  // Ouragan : ne balaie que les akumatisés du vocal (pas les innocents)
  const power = i.customId.split(':')[3];
  if (power === 'wind' && step === 'pick' && extraId === 'storm') {
    const target = targets[0];
    await i.deferUpdate();
    const stop = async (content) => { await i.editReply({ content, components: [] }); return true; };
    if (target.id === i.user.id) return stop('❌ Tu ne peux pas te cibler toi-même.');
    if (heroes.isProtected(i.guildId, target.id)) return stop('🛡️ Cette cible est protégée par un dôme.');
    const vc = target.voice.channel;
    if (!vc) return stop('❌ Ce membre n’est pas en vocal.');
    let n = 0;
    for (const vm of [...vc.members.values()]) {
      if (vm.id === i.user.id || vm.user.bot || heroes.isProtected(i.guildId, vm.id)) continue;
      if (!isAkuma(await fresh(i.guild, vm.id))) continue;
      if (await vm.voice.disconnect('Ouragan').then(() => true).catch(() => false)) n++;
    }
    await say(i.channel, `🐉🌪️ **Ouragan !** Les akumatisés du vocal **${vc.name}** sont balayés.`);
    await i.editReply({ content: `✅ Vent lancé (${n} akumatisé(s) emporté(s)).`, components: [] });
    return true;
  }
  return false;
}

// Miraculous Chat Noir / Piétinement : on lit les messages via un fetch filtré
// (Chat Noir n'efface que les messages des akumatisés ; Miraculous Ladybug pourra tout restaurer)
function withScopedFetch(i, onlyAkuma, fn) {
  const ch = i.channel;
  return serial(ch.id, async () => {
    const mgr = ch.messages;
    const orig = mgr.fetch.bind(mgr);
    mgr.fetch = async (...args) => {
      const res = await orig(...args);
      if (!res || typeof res.filter !== 'function' || typeof res.values !== 'function') return res;
      const ak = new Set();
      const authors = new Set([...res.values()].map((m) => m.author.id));
      await Promise.all([...authors].map(async (id) => { if (isAkuma(await fresh(i.guild, id))) ak.add(id); }));
      return onlyAkuma ? res.filter((m) => ak.has(m.author.id)) : res;
    };
    try { return await fn(); } finally { delete mgr.fetch; }
  });
}

/* ───────────────────────── INSTALLATION ───────────────────────── */

function install(client) {
  patchNicknames();
  trackEvents(client);
  heroes.setHooks({ repair });

  const original = heroes.handleInteraction;
  heroes.handleInteraction = async (i) => {
    const [ns, type, , power, step, extraId] = String(i.customId || '').split(':');
    const isHero = ns === 'hero' && i.inGuild && i.inGuild();

    if (isHero) {
      try {
        // Sélection de cibles : akumatisés uniquement (le dôme de Carapace reste libre)
        if (type === 'c' && power !== 'dome' && i.isUserSelectMenu && i.isUserSelectMenu()) {
          if (await filterTargets(i, step, extraId)) return true;
        }
        // Chat Noir : n'efface que l'akuma · Piétinement : exécutés l'un après l'autre dans le salon
        if (type === 'm' && i.isModalSubmit && i.isModalSubmit() && (power === 'cure' || power === 'stomp')) {
          return await withScopedFetch(i, power === 'cure', () => original(i));
        }
      } catch (e) {
        console.error('[heroes-akuma]', e);
      }
      summaries.delete(i.guildId);
    }

    const result = await original(i);

    // Bilan de la réparation après Miraculous Ladybug
    if (isHero && summaries.has(i.guildId)) {
      const s = summaries.get(i.guildId);
      summaries.delete(i.guildId);
      await say(i.channel, `🐞✨ **Réparation complète :** ${s}.`);
    }
    return result;
  };
}

module.exports = { install, repair };
