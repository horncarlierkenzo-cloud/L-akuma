// heroes.js — Héros Miraculous (panels privés + Amalgame) pour TADCBOT
'use strict';

const {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, UserSelectMenuBuilder, ChannelSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder,
  PermissionFlagsBits, ChannelType,
} = require('discord.js');

const EPH = { ephemeral: true };

/* ───────────────────────── DONNÉES ───────────────────────── */

const HEROES = {
  chatnoir:  { cmd: 'chat-noir',  name: 'Chat Noir',  emoji: '🐈‍⬛', color: 0x2b2d31, powers: ['cataclysme', 'cure'] },
  ladybug:   { cmd: 'ladybug',    name: 'Ladybug',    emoji: '🐞',   color: 0xe74c3c, powers: ['luckycharm', 'miraculousLadybug'] },
  carapace:  { cmd: 'carapace',   name: 'Carapace',   emoji: '🐢',   color: 0x2ecc71, powers: ['dome', 'domeOff'] },
  renarouge: { cmd: 'rena-rouge', name: 'Rena Rouge', emoji: '🦊',   color: 0xe67e22, powers: ['illusion', 'melody', 'decoy', 'copy'] },
  bunnyx:    { cmd: 'bunnyx',     name: 'Bunnyx',     emoji: '🐰',   color: 0x9b59b6, powers: ['rewind', 'timeMod', 'journal'] },
};

// Kwamis disponibles via Amalgame.
// Exclus volontairement : Fluff, Nooroo, Tikki, Plagg, Wayzz, Trixx.
// Pour en ajouter un : copie une ligne et choisis un pouvoir existant dans POWERS.
const KWAMIS = {
  pollen: { name: 'Pollen', emoji: '🐝', label: 'Soumission (venin)', power: 'venom' },
  duusu:  { name: 'Duusu',  emoji: '🦚', label: 'Émotion',            power: 'emotion' },
  longg:  { name: 'Longg',  emoji: '🐉', label: 'Vent',               power: 'wind' },
  kaalki: { name: 'Kaalki', emoji: '🐴', label: 'Portail',            power: 'portal' },
  sass:   { name: 'Sass',   emoji: '🐍', label: 'Seconde chance',     power: 'secondChance' },
  mullo:  { name: 'Mullo',  emoji: '🐭', label: 'Sommeil',            power: 'sleep' },
  stompp: { name: 'Stompp', emoji: '🐂', label: 'Piétinement',        power: 'stomp' },
  roaar:  { name: 'Roaar',  emoji: '🐯', label: 'Rugissement',        power: 'roar' },
  ziggy:  { name: 'Ziggy',  emoji: '🐐', label: 'Pseudo forcé',       power: 'rename' },
  xuppu:  { name: 'Xuppu',  emoji: '🐵', label: 'Farce',              power: 'prank' },
  orikko: { name: 'Orikko', emoji: '🐓', label: 'Cocorico',           power: 'cocorico' },
  barkk:  { name: 'Barkk',  emoji: '🐶', label: 'Flair',              power: 'sniff' },
  daizzi: { name: 'Daizzi', emoji: '🐷', label: 'Festin',             power: 'feast' },
};

// Rena Rouge n’a aucun pouvoir lié au temps (ni en copie, ni par Amalgame)
const TIME_POWERS = ['rewind', 'timeMod', 'journal', 'secondChance'];
// Pouvoirs de héros que Rena Rouge peut recopier (héros uniquement, sans le temps)
const COPYABLE = ['cataclysme', 'cure', 'luckycharm', 'miraculousLadybug', 'dome'];

const RIDDLES = [
  { q: 'Quel est le nom de famille de naissance de la mère d’Adrien, Émilie (avant son mariage) ?', a: ['graham de vanily', 'vanily'] },
  { q: 'Quel est le nom de famille de Nathalie, l’assistante de Gabriel Agreste ?', a: ['sancoeur'] },
  { q: 'Quel est le prénom complet (prénom de naissance) de Maître Fu ?', a: ['wang'] },
  { q: 'Comment s’appelle le collège de Marinette (nom complet de l’établissement) ?', a: ['francoise dupont'] },
  { q: 'Quel est le nom de famille de Nino, le meilleur ami d’Adrien ?', a: ['lahiffe'] },
  { q: 'Quel est le nom de famille d’Alya ?', a: ['cesaire'] },
  { q: 'Quel est le nom de famille de Nathaniel, le dessinateur de la classe ?', a: ['kurtzberg'] },
  { q: 'Quel est le nom de famille de Juleka et de son frère Luka ?', a: ['couffaine'] },
  { q: 'Quel est le nom de famille de Rose, l’élève qui adore le rose ?', a: ['lavillant'] },
  { q: 'Quel est le nom de famille de Max, le génie de la classe ?', a: ['kante'] },
  { q: 'Quel est le nom de famille d’Ivan, le batteur costaud de la classe ?', a: ['bruel'] },
  { q: 'Quel est le nom de famille de Mylène, l’amoureuse d’Ivan ?', a: ['haprele'] },
  { q: 'Quel est le nom de famille d’Alix, la fan de skate et de rollers ?', a: ['kubdel'] },
  { q: 'Quel est le nom de famille de Kim, le sportif de la classe ?', a: ['le chien', 'lechien'] },
  { q: 'Quel est le nom de famille de Sabrina, l’amie de Chloé ?', a: ['raincomprix'] },
  { q: 'Quel est le nom de famille de Marc, le rédacteur et amoureux de Nathaniel ?', a: ['anciel'] },
  { q: 'Quel est le nom de famille de Lila, l’élève arrivée en saison 2 ?', a: ['rossi'] },
  { q: 'Comment s’appelle la mère de Chloé Bourgeois ?', a: ['audrey'] },
  { q: 'Quel est le prénom du père de Chloé, le maire de Paris ?', a: ['andre'] },
  { q: 'Quel est le nom de famille de naissance de Sabine, la mère de Marinette ?', a: ['cheng'] },
];

const LUCKY_ITEMS = ['un parapluie', 'un yoyo', 'une corde à sauter', 'un cerf-volant', 'un skateboard', 'un extincteur', 'un ballon', 'une paire de menottes'];

const EMOTIONS = [
  ['😡', 'Colère'], ['😭', 'Tristesse'], ['😍', 'Amour'], ['😱', 'Peur'],
  ['😂', 'Joie'], ['😴', 'Fatigue'], ['🤪', 'Folie'], ['😎', 'Confiance'],
];

const FOODS = ['🍕', '🍔', '🍟', '🍰', '🍩', '🍗', '🍎', '🍜', '🥐', '🍫'];

/* ───────────────────────── ÉTAT (en mémoire) ───────────────────────── */

const hooks = {};                    // setHooks({ autoAttack, repair })
const heroes = new Map();            // guild:hero          -> userId
const amalgames = new Map();         // guild:user          -> kwamiKey
const kwamiHolders = new Map();      // guild:kwami         -> userId
const blocked = new Set();           // guild:user          (akuma bloqué)
const uncontrolled = new Map();      // guild:user          -> interval
const domes = new Map();             // guild:user          -> userId du Carapace
const pendingRiddle = new Map();     // userId              -> { q, a, tries }
const charges = new Map();           // guild:user          -> Miraculous Ladybug débloqués
const pendingTargets = new Map();    // userId              -> [ids] choisis à l’étape précédente
const venomed = new Map();           // guild:user          -> timer (sous venin)
const voiceFx = new Map();           // guild:user:kind     -> timer (mute / deaf)
const emotions = new Map();          // guild:user          -> { emoji, orig, timer }
const terriers = new Map();          // guild:bunnyx        -> channelId
const chanLog = new Map();           // channelId           -> [{id, tag, content, ts, deleted, restored}]
const noRestore = new Set();         // messages supprimés par le Miraculous de Chat Noir
const frozen = new Set();            // channelId           (temps figé en cours)
const decoys = new Map();            // channelId (faux salon) -> { guild, owner, timer }

// Supprime un faux salon de Rena Rouge (et expulse ceux qui y sont)
async function removeDecoy(chId, reason = 'Illusion dissipée') {
  const d = decoys.get(chId);
  if (!d) return;
  clearTimeout(d.timer);
  decoys.delete(chId);
  const c = await d.guild.channels.fetch(chId).catch(() => null);
  if (c) await c.delete(reason).catch(() => {});
}

/* ───────────────────────── OUTILS ───────────────────────── */

const k = (g, u) => `${g}:${u}`;
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const clampInt = (v, min, max, def) => { const n = parseInt(v, 10); return Number.isNaN(n) ? def : Math.min(max, Math.max(min, n)); };
const cid = (type, hk, power, step = '', extra = '') => `hero:${type}:${hk}:${power}:${step}:${extra}`;
const row = (...c) => new ActionRowBuilder().addComponents(...c);
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmtDur = (s) => (s >= 60 ? `${s / 60} min` : `${s} s`);

function btn(id, label, style = ButtonStyle.Secondary, emoji) {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  return b;
}

function mkModal(id, title, inputId, label, style, opts = {}) {
  const t = new TextInputBuilder().setCustomId(inputId).setLabel(label).setStyle(style).setRequired(true);
  if (opts.ph) t.setPlaceholder(opts.ph);
  if (opts.val) t.setValue(opts.val);
  if (opts.max) t.setMaxLength(opts.max);
  return new ModalBuilder().setCustomId(id).setTitle(title).addComponents(row(t));
}

async function announce(i, text) {
  try { await i.channel.send({ content: text, allowedMentions: { parse: [] } }); } catch { /* ignore */ }
}

function guardTarget(i, id) {
  if (id === i.user.id) return '❌ Tu ne peux pas te cibler toi-même.';
  if (domes.has(k(i.guildId, id))) return '🛡️ Cette cible est protégée par un dôme.';
  return null;
}

// Cible unique : renvoie le membre, ou répond une erreur (update) et renvoie null
async function pickTarget(i, id = i.values[0]) {
  const bad = guardTarget(i, id);
  const m = bad ? null : await i.guild.members.fetch(id).catch(() => null);
  if (bad || !m || m.user.bot) {
    await i.update({ content: bad || '❌ Cible invalide.', components: [] });
    return null;
  }
  return m;
}

// Cibles multiples : renvoie { ok: [membres], skipped: nb } ou null (erreur déjà envoyée)
async function pickTargets(i) {
  const ok = [];
  let skipped = 0;
  for (const id of i.values) {
    const bad = guardTarget(i, id);
    const m = bad ? null : await i.guild.members.fetch(id).catch(() => null);
    if (bad || !m || m.user.bot) skipped++; else ok.push(m);
  }
  if (!ok.length) {
    await i.update({ content: '❌ Aucune cible valide (protégée par un dôme, bot ou toi-même).', components: [] });
    return null;
  }
  return { ok, skipped };
}

function userSelect(id, placeholder, max = 1) {
  return row(new UserSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).setMinValues(1).setMaxValues(max));
}

function stringSelect(id, placeholder, options) {
  return row(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).addOptions(options));
}

const durOptions = (list) => list.map(([v, l]) => ({ label: l, value: String(v) }));

function stopUncontrolled(tk) {
  const t = uncontrolled.get(tk);
  if (t) clearInterval(t);
  uncontrolled.delete(tk);
}

function startUncontrolled(i, id) {
  const tk = k(i.guildId, id);
  stopUncontrolled(tk);
  const guild = i.guild;
  const channel = i.channel;
  const t = setInterval(async () => {
    try {
      if (hooks.autoAttack) await hooks.autoAttack(guild, id, channel);
      else await channel.send({ content: `💢 L’amok de <@${id}> attaque tout seul !`, allowedMentions: { parse: [] } });
    } catch { /* ignore */ }
  }, 20000);
  uncontrolled.set(tk, t);
}

function releaseKwami(guildId, userId) {
  const mine = amalgames.get(k(guildId, userId));
  if (mine) kwamiHolders.delete(k(guildId, mine));
  amalgames.delete(k(guildId, userId));
}

async function clearEmotion(guild, tk) {
  const e = emotions.get(tk);
  if (!e) return;
  clearTimeout(e.timer);
  emotions.delete(tk);
  const m = await guild.members.fetch(tk.split(':')[1]).catch(() => null);
  if (m && m.manageable) await m.setNickname(e.orig, 'Fin de l’effet').catch(() => {});
}

// Pseudo temporaire + réaction automatique (emoji vide = pas de réaction)
async function applyEmotion(guild, ids, emoji, sec, nickOf) {
  let done = 0;
  for (const id of ids) {
    const m = await guild.members.fetch(id).catch(() => null);
    if (!m) continue;
    const tk = k(guild.id, id);
    await clearEmotion(guild, tk);
    const orig = m.nickname;
    if (nickOf && m.manageable) await m.setNickname(nickOf(m).slice(0, 32), 'Effet kwami').catch(() => {});
    emotions.set(tk, { emoji, orig, timer: setTimeout(() => clearEmotion(guild, tk), sec * 1000) });
    done++;
  }
  return done;
}

// Libère tous les membres sous venin, mute, sourds ou sous émotion ; renvoie le nombre de libérés
async function freeVictims(guild) {
  const prefix = `${guild.id}:`;
  let n = 0;
  for (const [tk, timer] of [...venomed]) {
    if (!tk.startsWith(prefix)) continue;
    clearTimeout(timer);
    venomed.delete(tk);
    const m = await guild.members.fetch(tk.split(':')[1]).catch(() => null);
    if (m) { await m.timeout(null, 'Seconde chance').catch(() => {}); n++; }
  }
  for (const [fk, timer] of [...voiceFx]) {
    if (!fk.startsWith(prefix)) continue;
    clearTimeout(timer);
    voiceFx.delete(fk);
    const [, uid, kind] = fk.split(':');
    const m = await guild.members.fetch(uid).catch(() => null);
    if (m && m.voice.channel) {
      await (kind === 'mute' ? m.voice.setMute(false, 'Seconde chance') : m.voice.setDeaf(false, 'Seconde chance')).catch(() => {});
      n++;
    }
  }
  for (const tk of [...emotions.keys()]) {
    if (!tk.startsWith(prefix)) continue;
    await clearEmotion(guild, tk);
    n++;
  }
  return n;
}

// Restaure les messages supprimés (hors ceux du Miraculous de Chat Noir) ; renvoie { list, restored }
async function restoreDeleted(channel, min) {
  const cutoff = Date.now() - min * 60000;
  const list = (chanLog.get(channel.id) || []).filter((e) => e.ts >= cutoff);
  const lost = list.filter((e) => e.deleted && !e.restored).slice(0, 15);
  for (const e of lost) {
    e.restored = true;
    await channel.send({ content: `⏪ **${e.tag}** : ${e.content}`.slice(0, 1900), allowedMentions: { parse: [] } }).catch(() => {});
  }
  return { list, restored: lost.length };
}

function logText(list) {
  const txt = list
    .map((e) => `${e.deleted ? '🗑️' : '💬'} <t:${Math.floor(e.ts / 1000)}:T> **${e.tag}** : ${e.content}`.slice(0, 300))
    .join('\n')
    .slice(-3800);
  return txt || '*Rien à signaler sur cette période.*';
}

// Fabrique un pouvoir vocal (mute / sourd) sur jusqu’à 5 cibles
function voiceControl({ key, label, emoji, style, desc, kind, intro, verb }) {
  return {
    label, emoji, style, desc,
    async start(i, hk) {
      await i.reply({ ...EPH, content: `${emoji} **${label}** — ${intro} (jusqu’à 5)`, components: [userSelect(cid('c', hk, key, 'pick'), 'Cibles', 5)] });
    },
    async step(i, hk, step) {
      if (step === 'pick') {
        const res = await pickTargets(i);
        if (!res) return;
        pendingTargets.set(i.user.id, res.ok.map((m) => m.id));
        const opts = durOptions([[30, '30 secondes'], [60, '1 minute'], [120, '2 minutes'], [300, '5 minutes']]);
        return i.update({ content: `${emoji} ${res.ok.length} cible(s). Pendant combien de temps ?`, components: [stringSelect(cid('c', hk, key, 'go'), 'Durée', opts)] });
      }
      if (step === 'go') {
        const ids = pendingTargets.get(i.user.id) || [];
        pendingTargets.delete(i.user.id);
        const sec = clampInt(i.values[0], 30, 300, 60);
        const guild = i.guild;
        let done = 0;
        for (const id of ids) {
          const m = await guild.members.fetch(id).catch(() => null);
          if (!m || !m.voice.channel) continue;
          const ok = await (kind === 'mute' ? m.voice.setMute(true, label) : m.voice.setDeaf(true, label)).then(() => true).catch(() => false);
          if (!ok) continue;
          const fk = `${k(guild.id, id)}:${kind}`;
          clearTimeout(voiceFx.get(fk));
          voiceFx.set(fk, setTimeout(async () => {
            voiceFx.delete(fk);
            const mm = await guild.members.fetch(id).catch(() => null);
            if (mm && mm.voice.channel) await (kind === 'mute' ? mm.voice.setMute(false, 'Fin') : mm.voice.setDeaf(false, 'Fin')).catch(() => {});
          }, sec * 1000));
          done++;
        }
        await announce(i, `${emoji} **${label} !** ${ids.map((v) => `<@${v}>`).join(', ')} ${verb} pendant ${fmtDur(sec)}.`);
        return i.update({ content: `✅ ${label} lancé sur ${done}/${ids.length} membre(s) (seuls ceux en vocal sont touchés).`, components: [] });
      }
    },
  };
}

/* ───────────────────────── POUVOIRS ───────────────────────── */

const POWERS = {
  /* ---- Ladybug ---- */
  luckycharm: {
    label: 'Lucky Charm', emoji: '🍀', style: ButtonStyle.Danger,
    desc: 'Objet porte-bonheur + énigme de la série. Bonne réponse = Miraculous Ladybug activé.',
    async start(i, hk) {
      const r = rand(RIDDLES);
      const item = rand(LUCKY_ITEMS);
      pendingRiddle.set(i.user.id, { ...r, tries: 0 });
      await i.reply({
        ...EPH,
        content: `🍀 **Lucky Charm !** Tu obtiens : **${item}**\n\n🧩 Énigme : ${r.q}\n\n*Réponds juste pour activer le Miraculous Ladybug (3 essais).*`,
        components: [row(btn(cid('c', hk, 'luckycharm', 'answer'), 'Répondre', ButtonStyle.Success, '✏️'))],
      });
    },
    async step(i, hk, step) {
      if (step === 'answer') {
        return i.showModal(mkModal(cid('m', hk, 'luckycharm', 'answer'), 'Ta réponse', 'a', 'Réponse', TextInputStyle.Short, { max: 100 }));
      }
    },
    async modal(i, hk) {
      const p = pendingRiddle.get(i.user.id);
      if (!p) return i.reply({ ...EPH, content: 'Aucune énigme en cours. Relance un Lucky Charm.' });
      const a = norm(i.fields.getTextInputValue('a'));
      if (a && a.length <= 60 && p.a.some((x) => a.includes(norm(x)))) {
        pendingRiddle.delete(i.user.id);
        const ck = k(i.guildId, i.user.id);
        charges.set(ck, (charges.get(ck) || 0) + 1);
        return i.reply({ ...EPH, content: '✅ Bonne réponse ! **Miraculous Ladybug activé** 🐞✨ (1 utilisation)', ...panel(hk, i.guildId, i.user.id) });
      }
      p.tries++;
      if (p.tries >= 3) {
        const next = rand(RIDDLES.filter((x) => x.q !== p.q));
        pendingRiddle.set(i.user.id, { ...next, tries: 0 });
        return i.reply({
          ...EPH,
          content: `❌ Trois erreurs ! Nouvelle énigme :\n\n🧩 ${next.q}`,
          components: [row(btn(cid('c', hk, 'luckycharm', 'answer'), 'Répondre', ButtonStyle.Success, '✏️'))],
        });
      }
      return i.reply({
        ...EPH,
        content: `❌ Ce n’est pas ça… (${3 - p.tries} essai(s) restant(s))\n🧩 ${p.q}`,
        components: [row(btn(cid('c', hk, 'luckycharm', 'answer'), 'Répondre', ButtonStyle.Success, '✏️'))],
      });
    },
  },

  miraculousLadybug: {
    label: 'Miraculous Ladybug', emoji: '🐞', style: ButtonStyle.Success,
    desc: '🔒 Désactivé : s’active quand tu résous l’énigme du Lucky Charm (1 utilisation). Purifie tout.',
    async start(i, hk) {
      const ck = k(i.guildId, i.user.id);
      if ((charges.get(ck) || 0) <= 0) {
        return i.reply({ ...EPH, content: '🔒 Miraculous Ladybug est **désactivé**. Résous d’abord l’énigme du Lucky Charm pour l’activer.' });
      }
      charges.set(ck, charges.get(ck) - 1);
      const prefix = `${i.guildId}:`;
      for (const t of [...blocked]) if (t.startsWith(prefix)) blocked.delete(t);
      for (const t of [...uncontrolled.keys()]) if (t.startsWith(prefix)) stopUncontrolled(t);
      const freed = await freeVictims(i.guild);
      try { if (hooks.repair) await hooks.repair(i.guild); } catch { /* ignore */ }
      await announce(i, '🐞✨ **Miraculous Ladybug !** Les akumas sont purifiés, tout est réparé.');
      await i.reply({ ...EPH, content: `✅ Miraculous Ladybug lancé (${freed} victime(s) libérée(s)). Il est de nouveau 🔒 désactivé.`, ...panel(hk, i.guildId, i.user.id) });
    },
  },

  /* ---- Chat Noir ---- */
  cataclysme: {
    label: 'Cataclysme', emoji: '💥', style: ButtonStyle.Danger,
    desc: 'L’amok d’un membre perd le contrôle et attaque tout seul, ou son akuma est bloqué.',
    async start(i, hk) {
      await i.reply({
        ...EPH,
        content: '💥 **Cataclysme** — choisis l’effet :',
        components: [row(
          btn(cid('c', hk, 'cataclysme', 'mode', 'amok'), 'Amok incontrôlable', ButtonStyle.Danger),
          btn(cid('c', hk, 'cataclysme', 'mode', 'akuma'), 'Bloquer l’akuma', ButtonStyle.Secondary),
        )],
      });
    },
    async step(i, hk, step, extra) {
      if (step === 'mode') {
        return i.update({
          content: `💥 Cataclysme (${extra === 'amok' ? 'amok incontrôlable' : 'akuma bloqué'}) — choisis la cible :`,
          components: [userSelect(cid('c', hk, 'cataclysme', 'pick', extra), 'Cible')],
        });
      }
      if (step === 'pick') {
        const m = await pickTarget(i);
        if (!m) return;
        const tk = k(i.guildId, m.id);
        if (extra === 'akuma') {
          blocked.add(tk);
          stopUncontrolled(tk);
          await announce(i, `🐈‍⬛💥 **Cataclysme !** L’akuma de <@${m.id}> est **bloqué**.`);
        } else {
          startUncontrolled(i, m.id);
          await announce(i, `🐈‍⬛💥 **Cataclysme !** L’amok de <@${m.id}> **perd le contrôle** et attaque tout seul !`);
        }
        return i.update({ content: '✅ Cataclysme lancé.', components: [] });
      }
    },
  },

  cure: {
    label: 'Miraculous Chat Noir', emoji: '🧹', style: ButtonStyle.Primary,
    desc: 'Supprime tous les messages des dernières minutes du salon.',
    async start(i, hk) {
      return i.showModal(mkModal(cid('m', hk, 'cure', 'go'), 'Miraculous Chat Noir', 'min', 'Minutes à effacer (1-60)', TextInputStyle.Short, { val: '5', max: 2 }));
    },
    async modal(i) {
      const min = clampInt(i.fields.getTextInputValue('min'), 1, 60, 5);
      await i.deferReply(EPH);
      const msgs = await i.channel.messages.fetch({ limit: 100 });
      const cutoff = Date.now() - min * 60000;
      const toDelete = msgs.filter((m) => m.createdTimestamp >= cutoff && !m.pinned);
      toDelete.forEach((m) => noRestore.add(m.id));
      const res = await i.channel.bulkDelete(toDelete, true).catch(() => null);
      await i.editReply(`🧹 ${res ? res.size : 0} message(s) supprimé(s) (dernières ${min} min).`);
    },
  },

  /* ---- Carapace ---- */
  dome: {
    label: 'Dôme de protection', emoji: '🛡️', style: ButtonStyle.Primary,
    desc: 'Protège des membres : aucun pouvoir ne peut les cibler.',
    async start(i, hk) {
      await i.reply({ ...EPH, content: '🛡️ Qui protéger sous le dôme ? (tu l’es déjà)', components: [userSelect(cid('c', hk, 'dome', 'pick'), 'Membres à protéger', 10)] });
    },
    async step(i, hk, step) {
      if (step === 'pick') {
        domes.set(k(i.guildId, i.user.id), i.user.id);
        for (const id of i.values) domes.set(k(i.guildId, id), i.user.id);
        await announce(i, `🐢🛡️ **Dôme de protection !** ${i.values.map((v) => `<@${v}>`).join(', ')} sont protégés.`);
        return i.update({ content: '✅ Dôme activé (illimité, jusqu’à ce que tu le retires).', components: [] });
      }
    },
  },

  domeOff: {
    label: 'Retirer le dôme', emoji: '🔓', style: ButtonStyle.Secondary,
    desc: 'Lève la protection de tous les membres que tu protégeais.',
    async start(i) {
      for (const [t, owner] of [...domes]) if (owner === i.user.id && t.startsWith(`${i.guildId}:`)) domes.delete(t);
      await announce(i, '🐢 Le dôme de protection se dissipe.');
      await i.reply({ ...EPH, content: '✅ Dôme retiré.' });
    },
  },

  /* ---- Rena Rouge (aucun pouvoir du temps) ---- */
  illusion: {
    label: 'Illusion', emoji: '🦊', style: ButtonStyle.Primary,
    desc: 'Crée une illusion (titre + texte, et même une image) qui se dissipe au bout du temps choisi.',
    async start(i, hk) {
      const opts = durOptions([[15, '15 secondes'], [30, '30 secondes'], [60, '1 minute'], [300, '5 minutes']]);
      await i.reply({ ...EPH, content: '🦊 **Illusion** — combien de temps doit-elle durer ?', components: [stringSelect(cid('c', hk, 'illusion', 'dur'), 'Durée', opts)] });
    },
    async step(i, hk, step) {
      if (step === 'dur') {
        const sec = clampInt(i.values[0], 15, 300, 30);
        const title = new TextInputBuilder().setCustomId('ti').setLabel('Titre (facultatif)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80);
        const text = new TextInputBuilder().setCustomId('t').setLabel('Ce que les gens vont voir').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);
        const img = new TextInputBuilder().setCustomId('img').setLabel('Lien d’image (facultatif)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(300);
        return i.showModal(new ModalBuilder().setCustomId(cid('m', hk, 'illusion', 'go', String(sec))).setTitle('Illusion').addComponents(row(title), row(text), row(img)));
      }
    },
    async modal(i, hk, step, extra) {
      const sec = clampInt(extra, 15, 300, 30);
      const text = i.fields.getTextInputValue('t');
      const title = (i.fields.getTextInputValue('ti') || '').trim();
      const img = (i.fields.getTextInputValue('img') || '').trim();
      const emb = new EmbedBuilder().setColor(0xe67e22).setTitle(`🦊 ${title || 'Illusion'}`).setDescription(text).setFooter({ text: `Cette illusion se dissipe dans ${fmtDur(sec)}…` });
      if (/^https?:\/\//i.test(img)) emb.setImage(img);
      const msg = await i.channel.send({ embeds: [emb], allowedMentions: { parse: [] } });
      setTimeout(() => msg.delete().catch(() => {}), sec * 1000);
      await i.reply({ ...EPH, content: `✅ Illusion lancée (elle se dissipe dans ${fmtDur(sec)}).` });
    },
  },

  melody: {
    label: 'Mélodie hypnotique', emoji: '🎶', style: ButtonStyle.Success,
    desc: 'Jusqu’à 5 membres envoûtés par ta flûte : 🎶 sur leur pseudo + réaction auto (1 à 5 min).',
    async start(i, hk) {
      await i.reply({ ...EPH, content: '🎶 **Mélodie hypnotique** — qui envoûter ? (jusqu’à 5)', components: [userSelect(cid('c', hk, 'melody', 'pick'), 'Cibles', 5)] });
    },
    async step(i, hk, step) {
      if (step === 'pick') {
        const res = await pickTargets(i);
        if (!res) return;
        pendingTargets.set(i.user.id, res.ok.map((m) => m.id));
        const opts = durOptions([[60, '1 minute'], [180, '3 minutes'], [300, '5 minutes']]);
        return i.update({ content: `🎶 ${res.ok.length} cible(s). Pendant combien de temps ?`, components: [stringSelect(cid('c', hk, 'melody', 'go'), 'Durée', opts)] });
      }
      if (step === 'go') {
        const ids = pendingTargets.get(i.user.id) || [];
        pendingTargets.delete(i.user.id);
        const sec = clampInt(i.values[0], 60, 300, 180);
        const done = await applyEmotion(i.guild, ids, '🎶', sec, (m) => `🎶 ${m.displayName}`);
        await announce(i, `🦊🎶 **Mélodie hypnotique !** ${ids.map((v) => `<@${v}>`).join(', ')} dansent au son de la flûte pendant ${fmtDur(sec)}.`);
        return i.update({ content: `✅ Mélodie lancée sur ${done}/${ids.length} membre(s).`, components: [] });
      }
    },
  },

  decoy: {
    label: 'Salons illusoires', emoji: '🎭', style: ButtonStyle.Primary,
    desc: 'Copie jusqu’à 5 salons d’un coup : les faux salons disparaissent dès que quelqu’un y entre (vocal) ou y écrit (textuel).',
    async start(i, hk) {
      const menu = new ChannelSelectMenuBuilder()
        .setCustomId(cid('c', hk, 'decoy', 'pick'))
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
        .setPlaceholder('Salons à copier (jusqu’à 5)')
        .setMinValues(1)
        .setMaxValues(5);
      await i.reply({ ...EPH, content: '🎭 **Salons illusoires** — quels salons veux-tu copier ? Les copies disparaissent quand quelqu’un y entre, ou après 10 min.', components: [row(menu)] });
    },
    async step(i, hk, step) {
      if (step !== 'pick') return;
      await i.deferUpdate();
      const mine = [...decoys.values()].filter((d) => d.owner === i.user.id && d.guild.id === i.guildId).length;
      let made = 0;
      for (const id of i.values) {
        if (mine + made >= 10) break;
        const src = await i.guild.channels.fetch(id).catch(() => null);
        if (!src || decoys.has(src.id)) continue;
        const copy = await src.clone({ reason: 'Illusion de Rena Rouge' }).catch(() => null);
        if (!copy) continue;
        const timer = setTimeout(() => removeDecoy(copy.id, 'Illusion expirée'), 10 * 60000);
        decoys.set(copy.id, { guild: i.guild, owner: i.user.id, timer });
        made++;
      }
      return i.editReply({
        content: made
          ? `✅ ${made} salon(s) illusoire(s) créé(s) 🎭 Ils disparaîtront dès que quelqu’un y entre (vocal) ou y écrit (textuel), sinon après 10 min.`
          : '❌ Aucun salon copié (permission « Gérer les salons » manquante, ou limite de 10 faux salons atteinte).',
        components: [],
      });
    },
  },

  copy: {
    label: 'Copier un pouvoir', emoji: '🪞', style: ButtonStyle.Secondary,
    desc: 'Recopie le pouvoir d’un autre héros (héros uniquement, jamais le temps).',
    async start(i, hk) {
      const opts = COPYABLE.map((p) => ({ label: POWERS[p].label, value: p, emoji: POWERS[p].emoji, description: POWERS[p].desc.slice(0, 100) }));
      await i.reply({ ...EPH, content: '🪞 Quel pouvoir de héros veux-tu recopier ?', components: [stringSelect(cid('c', hk, 'copy', 'pick'), 'Pouvoir de héros', opts)] });
    },
    async step(i, hk, step) {
      if (step === 'pick') {
        const p = i.values[0];
        if (!COPYABLE.includes(p) || TIME_POWERS.includes(p)) return i.update({ content: '❌ Pouvoir non copiable.', components: [] });
        return POWERS[p].start(i, hk);
      }
    },
  },

  /* ---- Bunnyx ---- */
  rewind: {
    label: 'Remonter le temps', emoji: '⏪', style: ButtonStyle.Primary,
    desc: 'Remonte le temps : restaure les messages supprimés et ouvre le journal dans ton terrier.',
    async start(i, hk) {
      return i.showModal(mkModal(cid('m', hk, 'rewind', 'go'), 'Remonter le temps', 'min', 'Combien de minutes (1-30) ?', TextInputStyle.Short, { val: '5', max: 2 }));
    },
    async modal(i) {
      const min = clampInt(i.fields.getTextInputValue('min'), 1, 30, 5);
      await i.deferReply(EPH);
      const { list, restored } = await restoreDeleted(i.channel, min);
      const tid = terriers.get(k(i.guildId, 'bunnyx'));
      if (tid && heroes.get(k(i.guildId, 'bunnyx')) === i.user.id) {
        const terrier = await i.guild.channels.fetch(tid).catch(() => null);
        if (terrier) {
          await terrier.send({ embeds: [new EmbedBuilder().setColor(0x9b59b6).setTitle(`🐰 Journal du temps — ${min} dernière(s) minute(s) de #${i.channel.name}`).setDescription(logText(list))], allowedMentions: { parse: [] } }).catch(() => {});
        }
      }
      await announce(i, `🐰⏪ **Le temps a été remonté de ${min} min !**`);
      await i.editReply(`✅ ${restored} message(s) restauré(s).`);
    },
  },

  timeMod: {
    label: 'Modifier le temps', emoji: '⏳', style: ButtonStyle.Secondary,
    desc: 'Fige le temps (15 à 60 s), le ralentit (slowmode au choix) ou le remet à la normale.',
    async start(i, hk) {
      await i.reply({
        ...EPH,
        content: '⏳ Que fais-tu du temps dans ce salon ?',
        components: [row(
          btn(cid('c', hk, 'timeMod', 'freeze'), 'Figer', ButtonStyle.Danger, '⏸️'),
          btn(cid('c', hk, 'timeMod', 'slow'), 'Ralentir', ButtonStyle.Secondary, '🐌'),
          btn(cid('c', hk, 'timeMod', 'normal'), 'Temps normal', ButtonStyle.Success, '▶️'),
        )],
      });
    },
    async step(i, hk, step) {
      const ch = i.channel;
      if (!ch || !ch.permissionOverwrites) return i.update({ content: '❌ Salon non compatible.', components: [] });
      if (step === 'freeze') {
        const opts = durOptions([[15, '15 secondes'], [30, '30 secondes'], [60, '1 minute']]);
        return i.update({ content: '⏸️ Figer le temps pendant combien de temps ?', components: [stringSelect(cid('c', hk, 'timeMod', 'freezeset'), 'Durée', opts)] });
      }
      if (step === 'slow') {
        const opts = durOptions([[5, '5 s entre chaque message'], [15, '15 s'], [30, '30 s'], [60, '1 minute']]);
        return i.update({ content: '🐌 À quelle vitesse le temps doit-il s’écouler ?', components: [stringSelect(cid('c', hk, 'timeMod', 'slowset'), 'Ralentissement', opts)] });
      }
      try {
        if (step === 'slowset') {
          const s = clampInt(i.values[0], 5, 60, 15);
          await ch.setRateLimitPerUser(s, 'Bunnyx');
          await announce(i, `🐰⏳ Le temps **ralentit** (${s} s entre chaque message)…`);
        } else if (step === 'normal') {
          await ch.setRateLimitPerUser(0, 'Bunnyx');
          await announce(i, '🐰▶️ Le temps **reprend son cours normal**.');
        } else if (step === 'freezeset') {
          if (frozen.has(ch.id)) return i.update({ content: '⏸️ Le temps est déjà figé dans ce salon.', components: [] });
          const sec = clampInt(i.values[0], 15, 60, 30);
          const everyone = i.guild.roles.everyone;
          const ow = ch.permissionOverwrites.cache.get(everyone.id);
          const prev = ow && ow.deny.has(PermissionFlagsBits.SendMessages) ? false : ow && ow.allow.has(PermissionFlagsBits.SendMessages) ? true : null;
          frozen.add(ch.id);
          await ch.permissionOverwrites.edit(i.member, { SendMessages: true });
          await ch.permissionOverwrites.edit(everyone, { SendMessages: false });
          await announce(i, `🐰⏸️ **Le temps est figé pendant ${fmtDur(sec)} !**`);
          setTimeout(async () => {
            try {
              await ch.permissionOverwrites.edit(everyone, { SendMessages: prev });
              await ch.permissionOverwrites.delete(i.member);
              await ch.send('🐰▶️ Le temps reprend.');
            } catch { /* ignore */ }
            frozen.delete(ch.id);
          }, sec * 1000);
        }
      } catch {
        return i.update({ content: '❌ Il me manque la permission « Gérer les salons ».', components: [] });
      }
      return i.update({ content: '✅ Le temps a été modifié.', components: [] });
    },
  },

  journal: {
    label: 'Voyage dans le temps', emoji: '🕰️', style: ButtonStyle.Secondary,
    desc: 'Consulte en privé tout ce qui s’est dit dans le salon (messages supprimés inclus) jusqu’à 60 min en arrière.',
    async start(i, hk) {
      return i.showModal(mkModal(cid('m', hk, 'journal', 'go'), 'Voyage dans le temps', 'min', 'Combien de minutes (1-60) ?', TextInputStyle.Short, { val: '10', max: 2 }));
    },
    async modal(i) {
      const min = clampInt(i.fields.getTextInputValue('min'), 1, 60, 10);
      const cutoff = Date.now() - min * 60000;
      const list = (chanLog.get(i.channel.id) || []).filter((e) => e.ts >= cutoff);
      const lost = list.filter((e) => e.deleted).length;
      await i.reply({
        ...EPH,
        embeds: [new EmbedBuilder().setColor(0x9b59b6).setTitle(`🕰️ ${min} dernière(s) minute(s) de #${i.channel.name}`).setDescription(logText(list)).setFooter({ text: `${list.length} message(s) • ${lost} supprimé(s)` })],
      });
    },
  },

  /* ---- Pouvoirs de kwamis (Amalgame) ---- */

  // Pollen — Soumission : jusqu’à 5 cibles, durée au choix, éjectées du vocal
  venom: {
    label: 'Venin', emoji: '🐝', style: ButtonStyle.Danger,
    desc: 'Immobilise jusqu’à 5 membres (30 s à 10 min) et les éjecte du vocal.',
    async start(i, hk) {
      await i.reply({ ...EPH, content: '🐝 **Venin** — qui immobiliser ? (jusqu’à 5)', components: [userSelect(cid('c', hk, 'venom', 'pick'), 'Cibles', 5)] });
    },
    async step(i, hk, step) {
      if (step === 'pick') {
        const res = await pickTargets(i);
        if (!res) return;
        pendingTargets.set(i.user.id, res.ok.map((m) => m.id));
        const opts = durOptions([[30, '30 secondes'], [60, '1 minute'], [300, '5 minutes'], [600, '10 minutes']]);
        return i.update({ content: `🐝 ${res.ok.length} cible(s). Pendant combien de temps ?`, components: [stringSelect(cid('c', hk, 'venom', 'go'), 'Durée', opts)] });
      }
      if (step === 'go') {
        const ids = pendingTargets.get(i.user.id) || [];
        pendingTargets.delete(i.user.id);
        const sec = clampInt(i.values[0], 30, 600, 60);
        let done = 0;
        for (const id of ids) {
          const m = await i.guild.members.fetch(id).catch(() => null);
          if (!m || !m.moderatable) continue;
          await m.timeout(sec * 1000, 'Venin').catch(() => {});
          if (m.voice.channel) await m.voice.disconnect('Venin').catch(() => {});
          const tk = k(i.guildId, id);
          clearTimeout(venomed.get(tk));
          venomed.set(tk, setTimeout(() => venomed.delete(tk), sec * 1000));
          done++;
        }
        await announce(i, `🐝 **Venin !** ${ids.map((v) => `<@${v}>`).join(', ')} immobilisé(s) ${fmtDur(sec)}.`);
        return i.update({ content: `✅ Venin lancé sur ${done}/${ids.length} membre(s).`, components: [] });
      }
    },
  },

  // Duusu — Émotion : jusqu’à 5 cibles, 8 émotions, durée au choix, réaction auto sur leurs messages
  emotion: {
    label: 'Émotion', emoji: '🦚', style: ButtonStyle.Primary,
    desc: 'Jusqu’à 5 membres : pseudo + réaction auto sur leurs messages (1 à 10 min).',
    async start(i, hk) {
      await i.reply({ ...EPH, content: '🦚 **Émotion** — qui touches-tu ? (jusqu’à 5)', components: [userSelect(cid('c', hk, 'emotion', 'pick'), 'Cibles', 5)] });
    },
    async step(i, hk, step, extra) {
      if (step === 'pick') {
        const res = await pickTargets(i);
        if (!res) return;
        pendingTargets.set(i.user.id, res.ok.map((m) => m.id));
        const opts = EMOTIONS.map(([e, l]) => ({ label: `${e} ${l}`, value: e }));
        return i.update({ content: `🦚 ${res.ok.length} cible(s). Quelle émotion ?`, components: [stringSelect(cid('c', hk, 'emotion', 'dur'), 'Émotion', opts)] });
      }
      if (step === 'dur') {
        const opts = durOptions([[60, '1 minute'], [300, '5 minutes'], [600, '10 minutes']]);
        return i.update({ content: `🦚 ${i.values[0]} — pendant combien de temps ?`, components: [stringSelect(cid('c', hk, 'emotion', 'go', i.values[0]), 'Durée', opts)] });
      }
      if (step === 'go') {
        const ids = pendingTargets.get(i.user.id) || [];
        pendingTargets.delete(i.user.id);
        const sec = clampInt(i.values[0], 60, 600, 300);
        const done = await applyEmotion(i.guild, ids, extra, sec, (m) => `${extra} ${m.displayName}`);
        await announce(i, `🦚 **Émotion !** ${ids.map((v) => `<@${v}>`).join(', ')} submergé(s) par ${extra} pendant ${fmtDur(sec)}.`);
        return i.update({ content: `✅ Émotion lancée sur ${done}/${ids.length} membre(s).`, components: [] });
      }
    },
  },

  // Longg — Vent : rafale, bourrasque, ouragan
  wind: {
    label: 'Vent', emoji: '🌪️', style: ButtonStyle.Primary,
    desc: 'Rafale, bourrasque (vocaux au hasard) ou ouragan (vide tout un vocal).',
    async start(i, hk) {
      await i.reply({
        ...EPH,
        content: '🌪️ **Vent** — quelle force ?',
        components: [row(
          btn(cid('c', hk, 'wind', 'mode', 'gust'), 'Rafale', ButtonStyle.Secondary, '🌬️'),
          btn(cid('c', hk, 'wind', 'mode', 'scatter'), 'Bourrasque', ButtonStyle.Primary, '🌀'),
          btn(cid('c', hk, 'wind', 'mode', 'storm'), 'Ouragan', ButtonStyle.Danger, '🌪️'),
        )],
      });
    },
    async step(i, hk, step, extra) {
      if (step === 'mode') {
        const txt = { gust: 'Rafale : éjecte les membres choisis du vocal', scatter: 'Bourrasque : disperse les membres choisis dans des vocaux au hasard', storm: 'Ouragan : vide tout le vocal du membre choisi' }[extra];
        return i.update({ content: `🌪️ ${txt}.`, components: [userSelect(cid('c', hk, 'wind', 'pick', extra), 'Cibles', extra === 'storm' ? 1 : 5)] });
      }
      if (step === 'pick') {
        const res = await pickTargets(i);
        if (!res) return;
        let n = 0;
        if (extra === 'gust') {
          for (const m of res.ok) if (m.voice.channel && await m.voice.disconnect('Vent').then(() => true).catch(() => false)) n++;
          await announce(i, `🐉🌬️ **Rafale !** ${res.ok.map((m) => `<@${m.id}>`).join(', ')} soufflé(s) hors du vocal.`);
        } else if (extra === 'scatter') {
          const voices = [...i.guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).values()];
          for (const m of res.ok) {
            const others = voices.filter((c) => !m.voice.channel || c.id !== m.voice.channel.id);
            if (!m.voice.channel || !others.length) continue;
            if (await m.voice.setChannel(rand(others), 'Vent').then(() => true).catch(() => false)) n++;
          }
          await announce(i, `🐉🌀 **Bourrasque !** ${res.ok.map((m) => `<@${m.id}>`).join(', ')} dispersé(s) aux quatre vents.`);
        } else {
          const vc = res.ok[0].voice.channel;
          if (!vc) return i.update({ content: '❌ Ce membre n’est pas en vocal.', components: [] });
          for (const vm of [...vc.members.values()]) {
            if (vm.id === i.user.id || vm.user.bot || domes.has(k(i.guildId, vm.id))) continue;
            if (await vm.voice.disconnect('Ouragan').then(() => true).catch(() => false)) n++;
          }
          await announce(i, `🐉🌪️ **Ouragan !** Le vocal **${vc.name}** est balayé.`);
        }
        return i.update({ content: `✅ Vent lancé (${n} membre(s) emporté(s)).`, components: [] });
      }
    },
  },

  // Kaalki — Portail : membres choisis (jusqu’à 10) ou tout son salon vocal
  portal: {
    label: 'Portail', emoji: '🌀', style: ButtonStyle.Primary,
    desc: 'Téléporte jusqu’à 10 membres, ou tout ton vocal, vers un autre vocal.',
    async start(i, hk) {
      await i.reply({
        ...EPH,
        content: '🌀 **Portail** — qui téléporter ?',
        components: [row(
          btn(cid('c', hk, 'portal', 'mode', 'pick'), 'Membres choisis', ButtonStyle.Primary, '👥'),
          btn(cid('c', hk, 'portal', 'mode', 'all'), 'Tout mon vocal', ButtonStyle.Success, '🔊'),
        )],
      });
    },
    async step(i, hk, step, extra) {
      const destMenu = (ex) => row(new ChannelSelectMenuBuilder().setCustomId(cid('c', hk, 'portal', 'dest', ex)).setChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice).setPlaceholder('Salon vocal de destination'));
      if (step === 'mode') {
        if (extra === 'all') {
          if (!i.member.voice || !i.member.voice.channel) return i.update({ content: '❌ Tu dois être dans un salon vocal.', components: [] });
          return i.update({ content: `🌀 Où envoyer tout **${i.member.voice.channel.name}** ?`, components: [destMenu('all')] });
        }
        return i.update({ content: '🌀 Qui téléporter ? (jusqu’à 10)', components: [userSelect(cid('c', hk, 'portal', 'pick'), 'Membres en vocal', 10)] });
      }
      if (step === 'pick') {
        const res = await pickTargets(i);
        if (!res) return;
        pendingTargets.set(i.user.id, res.ok.map((m) => m.id));
        return i.update({ content: `🌀 ${res.ok.length} membre(s). Où les envoyer ?`, components: [destMenu('pick')] });
      }
      if (step === 'dest') {
        const dest = i.values[0];
        let n = 0;
        if (extra === 'all') {
          const src = i.member.voice && i.member.voice.channel;
          if (!src) return i.update({ content: '❌ Tu n’es plus en vocal.', components: [] });
          for (const vm of [...src.members.values()]) {
            if (vm.id !== i.user.id && domes.has(k(i.guildId, vm.id))) continue;
            if (await vm.voice.setChannel(dest, 'Portail').then(() => true).catch(() => false)) n++;
          }
        } else {
          const ids = pendingTargets.get(i.user.id) || [];
          pendingTargets.delete(i.user.id);
          for (const id of ids) {
            const m = await i.guild.members.fetch(id).catch(() => null);
            if (m && m.voice.channel && await m.voice.setChannel(dest, 'Portail').then(() => true).catch(() => false)) n++;
          }
        }
        await announce(i, `🐴🌀 **Portail !** ${n} membre(s) téléporté(s) vers <#${dest}>.`);
        return i.update({ content: `✅ Portail ouvert (${n} membre(s)).`, components: [] });
      }
    },
  },

  // Sass — Seconde chance : rembobine les messages ou libère les victimes des kwamis
  secondChance: {
    label: 'Seconde chance', emoji: '🐍', style: ButtonStyle.Success,
    desc: 'Restaure les messages supprimés ou libère les victimes des kwamis.',
    async start(i, hk) {
      await i.reply({
        ...EPH,
        content: '🐍 **Seconde chance** — que fais-tu ?',
        components: [row(
          btn(cid('c', hk, 'secondChance', 'msgs'), 'Rembobiner les messages', ButtonStyle.Primary, '⏪'),
          btn(cid('c', hk, 'secondChance', 'free'), 'Libérer les victimes', ButtonStyle.Success, '🕊️'),
        )],
      });
    },
    async step(i, hk, step) {
      if (step === 'msgs') {
        return i.showModal(mkModal(cid('m', hk, 'secondChance', 'go'), 'Seconde chance', 'min', 'Combien de minutes (1-30) ?', TextInputStyle.Short, { val: '5', max: 2 }));
      }
      if (step === 'free') {
        const n = await freeVictims(i.guild);
        await announce(i, `🐍🕊️ **Seconde chance !** ${n} membre(s) libéré(s).`);
        return i.update({ content: `✅ ${n} membre(s) libéré(s).`, components: [] });
      }
    },
    async modal(i) {
      const min = clampInt(i.fields.getTextInputValue('min'), 1, 30, 5);
      await i.deferReply(EPH);
      const { restored } = await restoreDeleted(i.channel, min);
      await announce(i, `🐍⏪ **Seconde chance !** ${restored} message(s) restauré(s).`);
      await i.editReply(`✅ ${restored} message(s) restauré(s).`);
    },
  },

  // Mullo — Sommeil : met jusqu’à 5 membres en sourdine vocale
  sleep: voiceControl({
    key: 'sleep', label: 'Sommeil', emoji: '😴', style: ButtonStyle.Primary, kind: 'mute',
    desc: 'Endort jusqu’à 5 membres en vocal : ils sont mis en sourdine (30 s à 5 min).',
    intro: 'qui endormir ?', verb: 'sont endormi(s)',
  }),

  // Roaar — Rugissement : rend sourds jusqu’à 5 membres en vocal
  roar: voiceControl({
    key: 'roar', label: 'Rugissement', emoji: '🐯', style: ButtonStyle.Danger, kind: 'deaf',
    desc: 'Un rugissement assourdissant : jusqu’à 5 membres en vocal deviennent sourds (30 s à 5 min).',
    intro: 'qui assourdir ?', verb: 'sont assourdi(s)',
  }),

  // Stompp — Piétinement : efface les messages récents d’un membre
  stomp: {
    label: 'Piétinement', emoji: '🐂', style: ButtonStyle.Danger,
    desc: 'Écrase tous les messages récents d’un membre dans le salon (1 à 30 min).',
    async start(i, hk) {
      await i.reply({ ...EPH, content: '🐂 **Piétinement** — dont qui écraser les messages ?', components: [userSelect(cid('c', hk, 'stomp', 'pick'), 'Cible')] });
    },
    async step(i, hk, step) {
      if (step === 'pick') {
        const m = await pickTarget(i);
        if (!m) return;
        pendingTargets.set(i.user.id, [m.id]);
        return i.showModal(mkModal(cid('m', hk, 'stomp', 'go'), 'Piétinement', 'min', 'Minutes à écraser (1-30)', TextInputStyle.Short, { val: '5', max: 2 }));
      }
    },
    async modal(i) {
      const [id] = pendingTargets.get(i.user.id) || [];
      pendingTargets.delete(i.user.id);
      if (!id) return i.reply({ ...EPH, content: '❌ Aucune cible en cours.' });
      if (domes.has(k(i.guildId, id))) return i.reply({ ...EPH, content: '🛡️ Cette cible est protégée par un dôme.' });
      const min = clampInt(i.fields.getTextInputValue('min'), 1, 30, 5);
      await i.deferReply(EPH);
      const msgs = await i.channel.messages.fetch({ limit: 100 });
      const cutoff = Date.now() - min * 60000;
      const toDelete = msgs.filter((x) => x.author.id === id && x.createdTimestamp >= cutoff && !x.pinned);
      toDelete.forEach((x) => noRestore.add(x.id));
      const res = await i.channel.bulkDelete(toDelete, true).catch(() => null);
      await announce(i, `🐂 **Piétinement !** Les messages de <@${id}> sont écrasés.`);
      await i.editReply(`✅ ${res ? res.size : 0} message(s) écrasé(s).`);
    },
  },

  // Ziggy — Pseudo forcé : change le pseudo d’un membre pendant 5 min
  rename: {
    label: 'Pseudo forcé', emoji: '🐐', style: ButtonStyle.Primary,
    desc: 'Impose un pseudo de ton choix à un membre pendant 5 minutes.',
    async start(i, hk) {
      await i.reply({ ...EPH, content: '🐐 **Pseudo forcé** — à qui ?', components: [userSelect(cid('c', hk, 'rename', 'pick'), 'Cible')] });
    },
    async step(i, hk, step) {
      if (step === 'pick') {
        const m = await pickTarget(i);
        if (!m) return;
        pendingTargets.set(i.user.id, [m.id]);
        return i.showModal(mkModal(cid('m', hk, 'rename', 'go'), 'Pseudo forcé', 'n', 'Nouveau pseudo', TextInputStyle.Short, { max: 32 }));
      }
    },
    async modal(i) {
      const ids = pendingTargets.get(i.user.id) || [];
      pendingTargets.delete(i.user.id);
      const name = i.fields.getTextInputValue('n').trim();
      if (!ids.length || !name) return i.reply({ ...EPH, content: '❌ Rien à faire.' });
      const done = await applyEmotion(i.guild, ids, '', 300, () => name);
      await announce(i, `🐐 **Pseudo forcé !** <@${ids[0]}> s’appelle désormais **${name}** pendant 5 min.`);
      await i.reply({ ...EPH, content: done ? '✅ Pseudo imposé (5 min).' : '❌ Impossible de changer ce pseudo.' });
    },
  },

  // Xuppu — Farce : effet surprise sur un membre
  prank: {
    label: 'Farce', emoji: '🐵', style: ButtonStyle.Primary,
    desc: 'Une farce surprise sur un membre : pseudo de singe, bananes et parfois un tour en vocal.',
    async start(i, hk) {
      await i.reply({ ...EPH, content: '🐵 **Farce** — qui piéger ?', components: [userSelect(cid('c', hk, 'prank', 'pick'), 'Cible')] });
    },
    async step(i, hk, step) {
      if (step === 'pick') {
        const m = await pickTarget(i);
        if (!m) return;
        await applyEmotion(i.guild, [m.id], '🍌', 120, (x) => `🐵 ${x.displayName}`);
        let extra = '';
        if (m.voice.channel && Math.random() < 0.5) {
          const voices = [...i.guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice && c.id !== m.voice.channel.id).values()];
          if (voices.length && await m.voice.setChannel(rand(voices), 'Farce').then(() => true).catch(() => false)) extra = ' et envoyé(e) en vocal au hasard';
        }
        await announce(i, `🐵 **Farce !** <@${m.id}> devient un singe 2 min${extra} 🍌`);
        return i.update({ content: '✅ Farce réussie.', components: [] });
      }
    },
  },

  // Orikko — Cocorico : annonce dans le salon
  cocorico: {
    label: 'Cocorico', emoji: '🐓', style: ButtonStyle.Success,
    desc: 'Réveille tout le salon avec une annonce solennelle de ton choix.',
    async start(i, hk) {
      return i.showModal(mkModal(cid('m', hk, 'cocorico', 'go'), 'Cocorico', 't', 'Ton annonce', TextInputStyle.Paragraph, { max: 1000 }));
    },
    async modal(i) {
      const text = i.fields.getTextInputValue('t');
      await i.channel.send({ embeds: [new EmbedBuilder().setColor(0xf1c40f).setTitle('🐓 COCORICO !').setDescription(text).setFooter({ text: `Annonce de ${i.user.username}` })], allowedMentions: { parse: [] } });
      await i.reply({ ...EPH, content: '✅ Annonce envoyée.' });
    },
  },

  // Barkk — Flair : retrouve un membre
  sniff: {
    label: 'Flair', emoji: '🐶', style: ButtonStyle.Secondary,
    desc: 'Flaire un membre : où est-il en vocal et quand a-t-il parlé ici pour la dernière fois ?',
    async start(i, hk) {
      await i.reply({ ...EPH, content: '🐶 **Flair** — qui pister ?', components: [userSelect(cid('c', hk, 'sniff', 'pick'), 'Cible')] });
    },
    async step(i, hk, step) {
      if (step === 'pick') {
        const m = await pickTarget(i);
        if (!m) return;
        const log = (chanLog.get(i.channel.id) || []).filter((e) => e.tag === m.user.username);
        const last = log[log.length - 1];
        const where = m.voice.channel ? `🔊 en vocal dans **${m.voice.channel.name}**` : '🔇 pas en vocal';
        const said = last ? `💬 dernier message ici : <t:${Math.floor(last.ts / 1000)}:R>` : '💬 rien vu récemment dans ce salon';
        return i.update({ content: `🐶 **Flair** — <@${m.id}> :\n${where}\n${said}`, components: [] });
      }
    },
  },

  // Daizzi — Festin : réactions gourmandes
  feast: {
    label: 'Festin', emoji: '🐷', style: ButtonStyle.Success,
    desc: 'Organise un festin : les derniers messages du salon se couvrent de plats.',
    async start(i) {
      await i.deferReply(EPH);
      const msgs = await i.channel.messages.fetch({ limit: 10 });
      for (const m of msgs.values()) await m.react(rand(FOODS)).catch(() => {});
      await announce(i, '🐷🍽️ **Festin !** Tout le monde à table !');
      await i.editReply('✅ Festin servi.');
    },
  },
};

/* ───────────────────────── AMALGAME ───────────────────────── */

const AMALGAME = {
  async start(i, hk) {
    const mine = amalgames.get(k(i.guildId, i.user.id));
    if (mine) {
      const kw = KWAMIS[mine];
      return i.reply({
        ...EPH,
        content: `🌀 **Amalgame** — ${kw.emoji} **${kw.name}** (${kw.label})\nPouvoir utilisable à l’infini. Un seul kwami à la fois.`,
        components: [row(
          btn(cid('c', hk, 'amalgame', 'use'), `Utiliser ${POWERS[kw.power].label}`, ButtonStyle.Success, '♾️'),
          btn(cid('c', hk, 'amalgame', 'release'), 'Relâcher le kwami', ButtonStyle.Secondary, '🔁'),
        )],
      });
    }
    const opts = Object.entries(KWAMIS).map(([key, kw]) => {
      const holder = kwamiHolders.get(k(i.guildId, key));
      const noTime = hk === 'renarouge' && TIME_POWERS.includes(kw.power);
      const tag = noTime ? ' (interdit)' : holder ? ' (pris)' : '';
      return { label: `${kw.name} — ${kw.label}${tag}`.slice(0, 100), value: key, emoji: kw.emoji, description: POWERS[kw.power].desc.slice(0, 100) };
    });
    return i.reply({
      ...EPH,
      content: '🌀 **Amalgame** — choisis UN kwami. Son pouvoir sera utilisable à l’infini.',
      components: [stringSelect(cid('c', hk, 'amalgame', 'pick'), 'Choisis un kwami', opts)],
    });
  },

  async step(i, hk, step) {
    const uk = k(i.guildId, i.user.id);
    if (step === 'pick') {
      const key = i.values[0];
      const kw = KWAMIS[key];
      if (!kw) return i.update({ content: '❌ Kwami inconnu.', components: [] });
      if (hk === 'renarouge' && TIME_POWERS.includes(kw.power)) return i.update({ content: '🚫 Rena Rouge ne peut pas utiliser les pouvoirs du temps.', components: [] });
      const holder = kwamiHolders.get(k(i.guildId, key));
      if (holder && holder !== i.user.id) return i.update({ content: `❌ ${kw.name} est déjà utilisé par <@${holder}>.`, components: [] });
      releaseKwami(i.guildId, i.user.id);
      amalgames.set(uk, key);
      kwamiHolders.set(k(i.guildId, key), i.user.id);
      return i.update({
        content: `🌀 ${kw.emoji} **${kw.name}** (${kw.label}) est à toi, pouvoir illimité.`,
        components: [row(
          btn(cid('c', hk, 'amalgame', 'use'), `Utiliser ${POWERS[kw.power].label}`, ButtonStyle.Success, '♾️'),
          btn(cid('c', hk, 'amalgame', 'release'), 'Relâcher le kwami', ButtonStyle.Secondary, '🔁'),
        )],
      });
    }
    if (step === 'use') {
      const mine = amalgames.get(uk);
      if (!mine) return i.update({ content: '❌ Tu n’as pas de kwami.', components: [] });
      if (hk === 'renarouge' && TIME_POWERS.includes(KWAMIS[mine].power)) return i.update({ content: '🚫 Rena Rouge ne peut pas utiliser les pouvoirs du temps.', components: [] });
      return POWERS[KWAMIS[mine].power].start(i, hk);
    }
    if (step === 'release') {
      releaseKwami(i.guildId, i.user.id);
      return i.update({ content: '🔁 Kwami relâché. Tu peux en choisir un autre via Amalgame.', components: [] });
    }
  },
};

/* ───────────────────────── TRANSFORMATION ───────────────────────── */

function panel(hk, guildId, userId) {
  const h = HEROES[hk];
  const unlocked = hk !== 'ladybug' || (charges.get(k(guildId, userId)) || 0) > 0;
  const lines = h.powers.map((p) => {
    if (p === 'miraculousLadybug') {
      return unlocked
        ? `${POWERS[p].emoji} **${POWERS[p].label}** — ✨ **Activé !** Purifie tout (1 utilisation).`
        : `🔒 **${POWERS[p].label}** — Désactivé : résous l’énigme du Lucky Charm pour l’activer.`;
    }
    return `${POWERS[p].emoji} **${POWERS[p].label}** — ${POWERS[p].desc}`;
  });
  lines.push('🌀 **Amalgame** — emprunte le pouvoir d’un kwami (illimité, un seul à la fois).');
  if (hk === 'renarouge') lines.push('🚫 *Rena Rouge n’a aucun pouvoir lié au temps.*');
  const buttons = h.powers.map((p) => {
    const b = btn(cid('p', hk, p), POWERS[p].label, POWERS[p].style, POWERS[p].emoji);
    if (p === 'miraculousLadybug' && !unlocked) b.setDisabled(true).setStyle(ButtonStyle.Secondary).setLabel('Miraculous Ladybug 🔒');
    return b;
  });
  buttons.push(btn(cid('p', hk, 'amalgame'), 'Amalgame', ButtonStyle.Primary, '🌀'));
  buttons.push(btn(cid('p', hk, 'leave'), 'Se détransformer', ButtonStyle.Secondary, '🔙'));
  return {
    embeds: [new EmbedBuilder().setColor(h.color).setTitle(`${h.emoji} Panel privé — ${h.name}`).setDescription(lines.join('\n'))],
    // Discord limite à 5 boutons par ligne
    components: Array.from({ length: Math.ceil(buttons.length / 5) }, (_, n) => row(...buttons.slice(n * 5, n * 5 + 5))),
  };
}

async function transform(i, hk) {
  const h = HEROES[hk];
  if (!i.guild) return i.reply({ ...EPH, content: '❌ Commande utilisable sur un serveur uniquement.' });
  const hkey = k(i.guildId, hk);
  const holder = heroes.get(hkey);
  if (holder && holder !== i.user.id) {
    return i.reply({ ...EPH, content: `❌ ${h.name} est déjà porté par <@${holder}>.` });
  }
  const already = holder === i.user.id;
  heroes.set(hkey, i.user.id);

  if (hk === 'bunnyx' && !terriers.has(hkey)) {
    const ch = await i.guild.channels.create({
      name: 'terrier-de-bunnyx',
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: i.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels] },
      ],
    }).catch(() => null);
    if (ch) {
      terriers.set(hkey, ch.id);
      ch.send(`🐰 Bienvenue dans ton terrier, <@${i.user.id}>. C’est ici que le journal du temps s’affiche quand tu remontes le temps.`).catch(() => {});
    }
  }

  await i.reply({ ...EPH, ...panel(hk, i.guildId, i.user.id) });
  if (!already) await announce(i, `${h.emoji} <@${i.user.id}> se transforme en **${h.name}** !`);
}

async function leave(i, hk) {
  const hkey = k(i.guildId, hk);
  heroes.delete(hkey);
  releaseKwami(i.guildId, i.user.id);
  for (const [t, owner] of [...domes]) if (owner === i.user.id && t.startsWith(`${i.guildId}:`)) domes.delete(t);
  if (hk === 'renarouge') {
    for (const [chId, d] of [...decoys]) if (d.owner === i.user.id && d.guild.id === i.guildId) removeDecoy(chId, 'Rena Rouge se détransforme');
  }
  const tid = terriers.get(hkey);
  if (tid) {
    terriers.delete(hkey);
    const c = await i.guild.channels.fetch(tid).catch(() => null);
    if (c) c.delete('Bunnyx se détransforme').catch(() => {});
  }
  await i.update({ content: `🔙 Tu t’es détransformé (${HEROES[hk].name}). Le miraculous est de nouveau libre.`, embeds: [], components: [] });
}

/* ───────────────────────── ROUTEUR ───────────────────────── */

async function handleInteraction(i) {
  if (i.isChatInputCommand()) {
    const hk = Object.keys(HEROES).find((x) => HEROES[x].cmd === i.commandName);
    if (!hk) return false;
    try { await transform(i, hk); } catch (e) {
      console.error('[heroes]', e);
      const msg = { ...EPH, content: '❌ Erreur (permissions du bot ?).' };
      if (i.replied || i.deferred) i.followUp(msg).catch(() => {}); else i.reply(msg).catch(() => {});
    }
    return true;
  }

  if (!i.customId || !i.customId.startsWith('hero:')) return false;
  const [, type, hk, power, step, extra] = i.customId.split(':');
  if (!HEROES[hk]) return false;

  if (heroes.get(k(i.guildId, hk)) !== i.user.id) {
    await i.reply({ ...EPH, content: '❌ Ce panel ne t’appartient plus.' }).catch(() => {});
    return true;
  }

  if (hk === 'renarouge' && TIME_POWERS.includes(power)) {
    await i.reply({ ...EPH, content: '🚫 Rena Rouge ne peut pas utiliser les pouvoirs du temps.' }).catch(() => {});
    return true;
  }

  const P = power === 'amalgame' ? AMALGAME : POWERS[power];
  try {
    if (type === 'p') {
      if (power === 'leave') await leave(i, hk); else await P.start(i, hk);
    } else if (type === 'c') {
      await P.step(i, hk, step, extra);
    } else if (type === 'm') {
      await P.modal(i, hk, step, extra);
    }
  } catch (e) {
    console.error('[heroes]', e);
    const msg = { ...EPH, content: '❌ Une erreur est survenue (permissions du bot ?).' };
    if (i.replied || i.deferred) i.followUp(msg).catch(() => {}); else i.reply(msg).catch(() => {});
  }
  return true;
}

/* ───────────────────────── ÉVÉNEMENTS ───────────────────────── */

function markDeleted(channelId, ids) {
  const a = chanLog.get(channelId);
  if (!a) return;
  for (const e of a) if (ids.includes(e.id) && !noRestore.has(e.id)) e.deleted = true;
}

function registerEvents(client) {
  // Faux salons de Rena Rouge : le salon textuel disparaît dès que quelqu’un y écrit
  client.on('messageCreate', (m) => {
    const d = decoys.get(m.channelId);
    if (d && m.author.id !== d.owner && !m.author.bot) removeDecoy(m.channelId);
  });
  // Faux salon vocal : disparaît dès que quelqu’un (autre que Rena Rouge) le rejoint
  client.on('voiceStateUpdate', (oldS, newS) => {
    if (!newS.channelId || newS.channelId === oldS.channelId) return;
    const d = decoys.get(newS.channelId);
    if (d && newS.id !== d.owner) removeDecoy(newS.channelId);
  });
  client.on('channelDelete', (c) => {
    const d = decoys.get(c.id);
    if (d) { clearTimeout(d.timer); decoys.delete(c.id); }
  });

  client.on('messageCreate', (m) => {
    if (!m.guild || m.author.bot) return;
    // Émotion / Mélodie / Farce : réaction automatique sur les messages de la victime
    const emo = emotions.get(k(m.guildId, m.author.id));
    if (emo && emo.emoji) m.react(emo.emoji).catch(() => {});
    // Journal du temps (Bunnyx / Sass / Barkk)
    if (!m.content) return;
    const a = chanLog.get(m.channelId) || [];
    a.push({ id: m.id, tag: m.author.username, content: m.content, ts: m.createdTimestamp, deleted: false, restored: false });
    if (a.length > 200) a.shift();
    chanLog.set(m.channelId, a);
  });
  client.on('messageDelete', (m) => markDeleted(m.channelId, [m.id]));
  client.on('messageDeleteBulk', (ms) => {
    const first = ms.first();
    if (first) markDeleted(first.channelId, [...ms.keys()]);
  });
}

/* ───────────────────────── EXPORTS ───────────────────────── */

const commandsData = Object.values(HEROES).map((h) =>
  new SlashCommandBuilder().setName(h.cmd).setDescription(`Se transformer en ${h.name} (panel privé)`));

module.exports = {
  commandsData,
  handleInteraction,
  registerEvents,
  isBlocked: (guildId, userId) => blocked.has(k(guildId, userId)),
  isProtected: (guildId, userId) => domes.has(k(guildId, userId)),
  setHooks: (h) => Object.assign(hooks, h),
};
