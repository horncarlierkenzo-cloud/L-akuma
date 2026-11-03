// heroes-akuma.js — Règles « akuma » pour les héros (ajout, ne modifie aucun fichier existant)
//  1) Les pouvoirs d'Amalgame (kwamis) ne peuvent viser que des Akumatisés
//  2) Les pouvoirs des héros ne peuvent viser que l'akuma (sauf Carapace : dôme inchangé)
//  3) Miraculous Ladybug répare TOUT (dégâts de l'akuma ET des héros), rend les pseudos
//     d'origine (même changés depuis le site) et désakumatise (retire le rôle Akumatisé)
//
// Branchement dans index.js :
//   - ajouter GatewayIntentBits.GuildMembers aux intents
//   - juste après `heroes.registerEvents(client);` ajouter :
//       require('./heroes-akuma').install(client);
'use strict';

const fs = require('fs');
const path = require('path');
const { Events, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const heroes = require('./heroes');
const base = require('./powers');
const extra = require('./powers-extra');

const { shields } = base;
const { effects } = extra;

const ROLE_NAME = process.env.AKUMA_ROLE || 'Akumatisé';
const WINDOW = 2 * 60 * 60 * 1000; // messages / salons : dégâts des 2 dernières heures réparables
const NICK_FILE = path.join(__dirname, 'nicknames.json');

/* ───────────────────────── OUTILS ───────────────────────── */

const isAkuma = (m) => !!m && m.roles.cache.some((r) => r.name === ROLE_NAME);
const fresh = (guild, id) => guild.members.fetch({ user: id, force: true }).catch(() => null);

async function say(channel, content) {
  try { await channel.send({ content, allowedMentions: { parse: [] } }); } catch { /* ignore */ }
}

const chain = new Map();
function serial(id, fn) {
  const prev = chain.get(id) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  chain.set(id, next);
  return next;
}

/* ───────────────────────── JOURNAL DES DÉGÂTS ───────────────────────── */

const msgLog = new Map();       // channelId -> [{ id, tag, content, ts, deleted, restored }]
const chanChanges = new Map();  // channelId -> { name, topic, rate, send, ts }
const chanRemoved = new Map();  // channelId -> { guildId, ts, data }
const summaries = new Map();    // guildId -> texte du dernier bilan

// Pseudos d'origine : « guildId:userId » -> { orig }. Sauvegardé sur disque (survit au redémarrage).
let nickLog = new Map();
const restoring = new Set(); // évite de re-enregistrer nos propres remises en état

function loadNicks() {
  try {
    nickLog = new Map(Object.entries(JSON.parse(fs.readFileSync(NICK_FILE, 'utf8'))));
  } catch { nickLog = new Map(); }
}
function saveNicks() {
  try { fs.writeFileSync(NICK_FILE, JSON.stringify(Object.fromEntries(nickLog))); } catch (e) { console.error('[heroes-akuma] sauvegarde pseudos :', e.message); }
}

const sendState = (c) => {
  const ow = c.permissionOverwrites && c.permissionOverwrites.cache.get(c.guild.id);
  if (!ow) return null;
  return ow.deny.has(PermissionFlagsBits.SendMessages) ? false : ow.allow.has(PermissionFlagsBits.SendMessages) ? true : null;
};

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
  loadNicks();

  // On charge tous les membres au démarrage pour connaître leur pseudo AVANT un changement
  client.once(Events.ClientReady, async () => {
    if (!client.options.intents.has(GatewayIntentBits.GuildMembers)) {
      console.error('[heroes-akuma] Intent « Membres » absent : les pseudos changés depuis le site ne seront PAS rendus. Ajoute GatewayIntentBits.GuildMembers.');
      return;
    }
    for (const g of client.guilds.cache.values()) await g.members.fetch().catch((e) => console.error('[heroes-akuma] fetch membres :', e.message));
  });

  // TOUT changement de pseudo (pouvoir, site, à la main…) : on retient le pseudo d'origine
  client.on(Events.GuildMemberUpdate, (o, n) => {
    if (o.partial) return;
    const key = `${n.guild.id}:${n.id}`;
    if (restoring.has(key)) return;
    const before = o.nickname || null;
    const after = n.nickname || null;
    if (before === after) return;
    const cur = nickLog.get(key);
    if (!cur) nickLog.set(key, { orig: before });
    else if (cur.orig === after) nickLog.delete(key); // revenu à l'origine tout seul
    else return;
    saveNicks();
  });

  client.on('messageCreate', (m) => {
    if (!m.guild || !m.content) return;
    const a = msgLog.get(m.channelId) || [];
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

  client.on('channelUpdate', (o, n) => {
    if (!n.guild || (n.isThread && n.isThread())) return;
    if (o.name === n.name && o.topic === n.topic && o.rateLimitPerUser === n.rateLimitPerUser && sendState(o) === sendState(n)) return;
    const prev = chanChanges.get(n.id);
    if (prev && Date.now() - prev.ts < WINDOW) return;
    chanChanges.set(n.id, { name: o.name, topic: o.topic || null, rate: o.rateLimitPerUser || 0, send: sendState(o), ts: Date.now() });
  });

  client.on('channelDelete', (c) => {
    if (!c.guild || (c.isThread && c.isThread())) return;
    if (c.name.startsWith('terrier-de-bunnyx')) return;
    const twin = c.guild.channels.cache.some((x) => x.id !== c.id && x.name === c.name && x.type === c.type);
    if (twin) return;
    chanRemoved.set(c.id, { guildId: c.guild.id, ts: Date.now(), data: snapshot(c) });
    chanChanges.delete(c.id);
  });
}

setInterval(() => {
  const limit = Date.now() - WINDOW;
  for (const [id, a] of msgLog) {
    const kept = a.filter((e) => e.ts >= limit);
    if (kept.length) msgLog.set(id, kept); else msgLog.delete(id);
  }
  for (const [key, v] of chanChanges) if (v.ts < limit) chanChanges.delete(key);
  for (const [key, v] of chanRemoved) if (v.ts < limit) chanRemoved.delete(key);
}, 30 * 60 * 1000).unref();

/* ───────────────────────── 3) RÉPARATION (Miraculous Ladybug) ───────────────────────── */
// Appelée par heroes.js (hooks.repair) quand Ladybug utilise son Miraculous.

async function repair(guild) {
  const cutoff = Date.now() - WINDOW;
  const n = { effects: 0, shields: 0, timeouts: 0, voice: 0, msgs: 0, chans: 0, fixed: 0, nicks: 0, purified: 0 };
  // Chaque étape est isolée : si l'une plante, les autres sont quand même faites (et l'erreur s'affiche dans la console)
  const run = async (name, fn) => {
    try { await fn(); } catch (e) { console.error(`[heroes-akuma] réparation « ${name} » :`, e); }
  };

  await run('membres', async () => {
    if (guild.client.options.intents.has(GatewayIntentBits.GuildMembers)) await guild.members.fetch();
  });

  // Désakumatisation : tout le monde perd le rôle Akumatisé
  await run('désakumatisation', async () => {
    const role = guild.roles.cache.find((r) => r.name === ROLE_NAME);
    if (!role) return;
    for (const m of [...role.members.values()]) {
      if (await m.roles.remove(role, 'Miraculous Ladybug').then(() => true).catch((e) => { console.error(`[heroes-akuma] rôle impossible à retirer à ${m.user.username} : ${e.message}`); return false; })) n.purified++;
    }
  });

  // Pseudos d'origine rendus (peu importe qui les a changés : pouvoir, site, à la main), sans limite de temps
  await run('pseudos', async () => {
    for (const [nk, rec] of [...nickLog]) {
      if (!nk.startsWith(`${guild.id}:`)) continue;
      const m = await guild.members.fetch(nk.split(':')[1]).catch(() => null);
      if (!m) { nickLog.delete(nk); continue; }
      if ((m.nickname || null) === rec.orig) { nickLog.delete(nk); continue; }
      if (!m.manageable) { console.error(`[heroes-akuma] pseudo de ${m.user.username} non modifiable (rôle plus haut que le bot ou propriétaire).`); continue; }
      restoring.add(nk);
      const ok = await m.setNickname(rec.orig, 'Miraculous Ladybug').then(() => true).catch(() => false);
      setTimeout(() => restoring.delete(nk), 5000).unref();
      if (ok) { nickLog.delete(nk); n.nicks++; }
    }
    saveNicks();
  });

  // Effets de pouvoirs d'akuma (Mime, Simon Says, Copycat, Oblivio…) et boucliers de pierre
  await run('effets', async () => {
    n.shields = shields.size;
    shields.clear();
    for (const m of Object.values(effects)) {
      if (m && typeof m.clear === 'function') { n.effects += m.size || 0; m.clear(); }
    }
  });

  // Membres figés (timeout)
  await run('timeouts', async () => {
    for (const m of guild.members.cache.values()) {
      if (m.isCommunicationDisabled && m.isCommunicationDisabled()) {
        if (await m.timeout(null, 'Miraculous Ladybug').then(() => true).catch(() => false)) n.timeouts++;
      }
    }
  });

  // Vocal : sourdine / sourd
  await run('vocal', async () => {
    for (const vs of guild.voiceStates.cache.values()) {
      if (!vs.channelId) continue;
      if (vs.serverMute && await vs.setMute(false, 'Miraculous Ladybug').then(() => true).catch(() => false)) n.voice++;
      if (vs.serverDeaf && await vs.setDeaf(false, 'Miraculous Ladybug').then(() => true).catch(() => false)) n.voice++;
    }
  });

  // Salons supprimés → recréés
  await run('salons supprimés', async () => {
    for (const [id, c] of [...chanRemoved]) {
      if (c.guildId !== guild.id) continue;
      chanRemoved.delete(id);
      if (c.ts < cutoff) continue;
      const made = await guild.channels.create({ ...c.data, reason: 'Miraculous Ladybug' }).catch((e) => { console.error('[heroes-akuma] salon non recréé :', e.message); return null; });
      if (made) n.chans++;
    }
  });

  // Salons renommés / sujet / mode lent / figés → remis comme avant
  await run('salons modifiés', async () => {
    for (const [id, c] of [...chanChanges]) {
      const ch = guild.channels.cache.get(id);
      if (!ch) continue;
      chanChanges.delete(id);
      if (c.ts < cutoff) continue;
      let touched = false;
      if (ch.name !== c.name && await ch.setName(c.name, 'Miraculous Ladybug').then(() => true).catch(() => false)) touched = true;
      if ('topic' in ch && (ch.topic || null) !== c.topic && await ch.setTopic(c.topic, 'Miraculous Ladybug').then(() => true).catch(() => false)) touched = true;
      if ('rateLimitPerUser' in ch && (ch.rateLimitPerUser || 0) !== c.rate && await ch.setRateLimitPerUser(c.rate, 'Miraculous Ladybug').then(() => true).catch(() => false)) touched = true;
      if (c.send !== undefined && ch.permissionOverwrites && sendState(ch) !== c.send
        && await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: c.send }, { reason: 'Miraculous Ladybug' }).then(() => true).catch(() => false)) touched = true;
      if (touched) n.fixed++;
    }
  });

  // Messages supprimés → restaurés
  await run('messages', async () => {
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
  });

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
  i.values = targets.map((m) => m.id);

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
  trackEvents(client);

  if (typeof heroes.setHooks === 'function') heroes.setHooks({ repair });
  else console.error('[heroes-akuma] heroes.setHooks est introuvable : Miraculous Ladybug ne réparera RIEN. Voir heroes.js.');
  if (typeof heroes.isProtected !== 'function') console.error('[heroes-akuma] heroes.isProtected est introuvable dans heroes.js.');

  const original = heroes.handleInteraction;
  heroes.handleInteraction = async (i) => {
    const [ns, type, , power, step, extraId] = String(i.customId || '').split(':');
    const isHero = ns === 'hero' && i.inGuild && i.inGuild();

    if (isHero) {
      try {
        if (type === 'c' && power === 'portal' && step === 'dest' && extraId === 'all' && i.isChannelSelectMenu && i.isChannelSelectMenu()) {
          await i.deferUpdate();
          const src = i.member.voice && i.member.voice.channel;
          if (!src) { await i.editReply({ content: '❌ Tu n’es plus en vocal.', components: [] }); return true; }
          const dest = i.values[0];
          let n = 0;
          for (const vm of [...src.members.values()]) {
            if (vm.id !== i.user.id) {
              if (vm.user.bot || heroes.isProtected(i.guildId, vm.id)) continue;
              if (!isAkuma(await fresh(i.guild, vm.id))) continue;
            }
            if (await vm.voice.setChannel(dest, 'Portail').then(() => true).catch(() => false)) n++;
          }
          await say(i.channel, `🐴🌀 **Portail !** ${n} membre(s) téléporté(s) vers <#${dest}>.`);
          await i.editReply({ content: `✅ Portail ouvert (${n} membre(s), akumatisés uniquement).`, components: [] });
          return true;
        }
        if (type === 'c' && power !== 'dome' && i.isUserSelectMenu && i.isUserSelectMenu()) {
          if (await filterTargets(i, step, extraId)) return true;
        }
        if (type === 'm' && i.isModalSubmit && i.isModalSubmit() && (power === 'cure' || power === 'stomp')) {
          return await withScopedFetch(i, power === 'cure', () => original(i));
        }
      } catch (e) {
        console.error('[heroes-akuma]', e);
        if (type === 'c' || type === 'm') {
          if (!i.replied && !i.deferred) await i.reply({ content: '❌ Une erreur est survenue.', ephemeral: true }).catch(() => {});
          return true;
        }
      }
      summaries.delete(i.guildId);
    }

    const result = await original(i);

    if (isHero && summaries.has(i.guildId)) {
      const s = summaries.get(i.guildId);
      summaries.delete(i.guildId);
      await say(i.channel, `🐞✨ **Réparation complète :** ${s}.`);
    }
    return result;
  };
}

module.exports = { install, repair };
