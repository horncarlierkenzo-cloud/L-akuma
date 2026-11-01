const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { UserError } = require('./powers');

const MIN = 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rand(a.length)];

// Effets sur les messages : id du joueur -> { end, phrase? } (lus par index.js)
const effects = { mime: new Map(), simon: new Map(), copycat: new Map(), oblivio: new Map() };
const DUREE = 3 * MIN;

function voiceNamed(interaction, re, label) {
  const ch = interaction.guild.channels.cache.find((c) => c.isVoiceBased() && re.test(c.name));
  if (!ch) throw new UserError(`Il faut un salon vocal nommé « ${label} » sur le serveur.`);
  return ch;
}

// ---- Gamer : un mini-jeu tiré au hasard à chaque fois
const GAMES = [
  () => { const n = 1 + rand(3); return { q: '🔢 Je pense à un nombre de 1 à 3. Devine-le !', labels: ['1', '2', '3'], win: (i) => i + 1 === n }; },
  () => { const b = rand(3); return { q: '✊ Pierre, feuille ou ciseaux ? Bats-moi !', labels: ['🪨 Pierre', '📄 Feuille', '✂️ Ciseaux'], win: (i) => (i + 2) % 3 === b }; },
  () => {
    const Q = pick([
      ['Quel est le vrai prénom de Ladybug ?', ['Alya', 'Marinette', 'Chloé'], 1],
      ['Comment s’appelle le kwami de Chat Noir ?', ['Plagg', 'Tikki', 'Wayzz'], 0],
      ['Qui est Papillon ?', ['Nathaniel', 'Gabriel Agreste', 'Lila'], 1],
    ]);
    return { q: '🦋 Quiz : ' + Q[0], labels: Q[1], win: (i) => i === Q[2] };
  },
  () => { const a = 2 + rand(8); const b = 2 + rand(8); const r = a * b; return { q: `🧮 ${a} × ${b} = ?`, labels: [r - 2, r, r + 1].map(String), win: (i) => i === 1 }; },
  () => {
    const E = ['🐞', '🐱', '🦋', '🌸', '⭐'];
    const seq = [pick(E), pick(E), pick(E)];
    return { show: `🧠 Retiens ces emojis : ${seq.join(' ')}`, q: '🧠 Quel était le 2e emoji ?', labels: E, win: (i) => E[i] === seq[1] };
  },
  () => ({ reflex: true }),
];

async function play({ caster, target, say }) {
  const g = pick(GAMES)();
  const head = `🎮 ${target}, ${caster} t’a piégé(e) dans son jeu !`;
  const rows = (labels) => [new ActionRowBuilder().addComponents(labels.map((l, i) => new ButtonBuilder().setCustomId('g' + i).setLabel(l).setStyle(ButtonStyle.Primary)))];
  const filter = (i) => i.user.id === target.id;
  let msg;
  let ok = false;
  try {
    if (g.reflex) {
      msg = await say({ content: `${head}\n⚡ Prépare-toi… clique dès que le bouton apparaît (2 s) !`, fetchReply: true });
      await sleep(1000 + rand(3000));
      await msg.edit({ components: rows(['CLIQUE !']) });
      const c = await msg.awaitMessageComponent({ filter, time: 2000 });
      ok = true;
      await c.update({ components: [] });
    } else {
      msg = await say({ content: `${head}\n${g.show || g.q}`, components: g.show ? [] : rows(g.labels), fetchReply: true });
      if (g.show) {
        await sleep(3000);
        await msg.edit({ content: `${head}\n${g.q}`, components: rows(g.labels) });
      }
      const c = await msg.awaitMessageComponent({ filter, time: 15000 });
      ok = g.win(Number(c.customId.slice(1)));
      await c.update({ components: [] });
    }
  } catch (_) { ok = false; }
  if (!ok) await target.timeout(2 * MIN, 'Gamer').catch(() => {});
  if (msg) {
    await msg.edit({ content: ok ? `🎮 ${target} s’échappe du jeu !` : `🎮 ${target} a perdu : figé(e) 2 minutes.`, components: [] }).catch(() => {});
  }
  return ok ? '🎮 Le défi du Gamer a échoué.' : '🎮 Le Gamer a gagné la partie !';
}

// Les libellés (label) doivent rester identiques à ceux du site.
const POWERS = [
  { key: 'gamer', label: 'Gamer', needsTarget: true, run: play },
  {
    key: 'glace', label: 'Glace', needsTarget: true,
    async run({ caster, target }) {
      await target.timeout(3 * MIN, 'Glace');
      return `❄️ ${caster} gèle ${target} : plus d’écriture ni de vocal.`;
    },
  },
  {
    key: 'mime', label: 'Mime', needsTarget: true,
    async run({ caster, target }) {
      effects.mime.set(target.id, { end: Date.now() + DUREE });
      return `🤐 ${caster} transforme ${target} en mime : emojis seulement.`;
    },
  },
  {
    key: 'simon-says', label: 'Simon Says', needsTarget: true, needsText: true,
    async run({ caster, target, text }) {
      effects.simon.set(target.id, { end: Date.now() + DUREE, phrase: text });
      return `📢 ${caster} ordonne à ${target} d’écrire : « ${text} » avant de reparler.`;
    },
  },
  {
    key: 'copycat', label: 'Copycat', needsTarget: true,
    async run({ caster, target }) {
      effects.copycat.set(target.id, { end: Date.now() + DUREE });
      return `🐱 ${caster} lance Copycat : les messages de ${target} seront répétés.`;
    },
  },
  {
    key: 'oblivio', label: 'Oblivio', needsTarget: true,
    async run({ caster, target }) {
      effects.oblivio.set(target.id, { end: Date.now() + DUREE });
      return `🫥 ${caster} fait oublier ${target} : ses messages disparaissent.`;
    },
  },
  {
    key: 'stormy-weather', label: 'Stormy Weather', needsTarget: true,
    async run({ interaction, caster, target }) {
      const ch = voiceNamed(interaction, /temp[eê]te/i, 'Tempête');
      if (!target.voice.channelId) throw new UserError('La cible doit être dans un salon vocal.');
      await target.voice.setChannel(ch, 'Stormy Weather');
      return `⛈️ ${caster} envoie ${target} dans la tempête.`;
    },
  },
  {
    key: 'rogercop', label: 'Rogercop', needsTarget: true,
    async run({ interaction, caster, target }) {
      const ch = voiceNamed(interaction, /prison/i, 'Prison');
      if (!target.voice.channelId) throw new UserError('La cible doit être dans un salon vocal.');
      await target.voice.setChannel(ch, 'Rogercop');
      return `🚓 ${caster} enferme ${target} en prison.`;
    },
  },
];

module.exports = { POWERS, effects };
