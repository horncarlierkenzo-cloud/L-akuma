const {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  SlashCommandBuilder,
} = require('discord.js');
const base = require('./powers');
const extra = require('./powers-extra');
const { UserError, shields } = base;
const { effects } = extra;
// Les pouvoirs de powers-extra remplacent ceux de même clé (ex. Gamer aléatoire)
const POWERS = [...base.POWERS.filter((p) => !extra.POWERS.some((e) => e.key === p.key)), ...extra.POWERS];

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN manquant : le bot ne se connecte pas.');
  return;
}

const ROLE_NAME = process.env.AKUMA_ROLE || 'Akumatisé';
const COOLDOWN_MS = 20 * 1000;
const cooldowns = new Map();
const MIN = 60 * 1000;

// ---- Amok : lus dans le rôle « Amok · Nom » donné par le site
const AMOK_PREFIX = 'Amok · ';
const slug = (s) => s.toLowerCase().replace(/\s+/g, '-');
const amokOf = (member) => {
  const r = member.roles.cache.find((x) => x.name.startsWith(AMOK_PREFIX));
  return r ? { label: r.name.slice(AMOK_PREFIX.length), key: slug(r.name.slice(AMOK_PREFIX.length)) } : null;
};
const BLOQUE = ['princess-fragrance', 'antibug', 'sandboy', 'miraculous-queen'];
const RENVOI = ['reflekta', 'timebreaker'];
// Effet supplémentaire des amok d'attaque, appliqué à la cible après le pouvoir
const ATTAQUE = {
  stoneheart: async (t) => { if (t.voice.channelId) await t.voice.setMute(true, 'Stoneheart'); },
  'dark-owl': async (t) => { await t.send('🦉 Dark Owl t’observe… tu n’es pas seul(e).'); },
  evillustrator: async (t) => { await t.timeout(MIN, 'Evillustrator'); },
  bubbler: async (t, g) => { const c = g.channels.cache.find((x) => x.isVoiceBased() && /bulle/i.test(x.name)); if (c && t.voice.channelId) await t.voice.setChannel(c, 'Bubbler'); },
  rogercop: async (t, g) => { const c = g.channels.cache.find((x) => x.isVoiceBased() && /prison/i.test(x.name)); if (c && t.voice.channelId) await t.voice.setChannel(c, 'Rogercop'); },
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // à activer dans le portail développeur (Bot > Message Content Intent)
  ],
});

const commands = [
  new SlashCommandBuilder()
    .setName('pouvoir')
    .setDescription('Utilise le pouvoir donné par Papillon Ombre')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('cible').setDescription('Le joueur visé'))
    .addStringOption((o) => o.setName('texte').setDescription('Le texte du pouvoir (si besoin)').setMaxLength(300))
    .toJSON(),
];

async function registerCommands(guild) {
  try {
    await guild.commands.set(commands);
    console.log(`Commande /pouvoir enregistrée sur ${guild.name}`);
  } catch (e) {
    console.error(`Commande non enregistrée sur ${guild.name} : ${e.message} (réinvite le bot avec « applications.commands »)`);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
  for (const guild of client.guilds.cache.values()) await registerCommands(guild);
});
client.on(Events.GuildCreate, registerCommands);
client.on('error', console.error);

// ---- Effets sur les messages (Mime, Simon Says, Copycat, Oblivio)
const SANS_EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Component}\s]|<a?:\w+:\d+>/gu;
function actif(map, id) {
  const e = map.get(id);
  if (e && e.end <= Date.now()) { map.delete(id); return null; }
  return e || null;
}
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.inGuild()) return;
  const id = message.author.id;
  try {
    if (actif(effects.oblivio, id)) return void (await message.delete());
    if (actif(effects.mime, id) && message.content.replace(SANS_EMOJI, '').length) return void (await message.delete());
    const s = actif(effects.simon, id);
    if (s) {
      if (message.content.trim().toLowerCase() === s.phrase.trim().toLowerCase()) effects.simon.delete(id);
      else return void (await message.delete());
    }
    if (actif(effects.copycat, id) && message.content) {
      await message.channel.send({
        embeds: [new EmbedBuilder()
          .setAuthor({ name: message.member ? message.member.displayName : message.author.username, iconURL: message.author.displayAvatarURL() })
          .setDescription(message.content.slice(0, 1500))
          .setColor(0x7b2cbf)
          .setFooter({ text: '🐱 Copycat' })],
      });
    }
  } catch (e) {
    console.error('Effet de message impossible :', e.message);
  }
});

// Le pouvoir est lu dans le dernier message privé envoyé par le bot (pied de l'embed).
async function findPower(user) {
  try {
    const dm = await user.createDM();
    const msgs = await dm.messages.fetch({ limit: 50 });
    const mine = [...msgs.values()]
      .filter((m) => m.author.id === client.user.id)
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    for (const m of mine) {
      const footer = m.embeds[0] && m.embeds[0].footer && m.embeds[0].footer.text;
      if (!footer) continue;
      const power = POWERS.find((p) => footer === `Pouvoir : ${p.label} · /pouvoir`);
      if (power) return power;
    }
  } catch (e) {
    console.error('Lecture des messages privés impossible :', e.message);
  }
  return null;
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'pouvoir') return;
  if (!interaction.inGuild()) return;

  const fail = async (content) => {
    await interaction.deleteReply().catch(() => {});
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
  };

  try {
    await interaction.deferReply();

    const member = interaction.member;
    if (!member.roles.cache.some((r) => r.name === ROLE_NAME)) {
      return fail(`Tu n’es pas akumatisé : il faut le rôle « ${ROLE_NAME} ».`);
    }

    const wait = (cooldowns.get(interaction.user.id) || 0) - Date.now();
    if (wait > 0) return fail(`Ton pouvoir se recharge : encore ${Math.ceil(wait / 1000)} s.`);

    const power = await findPower(interaction.user);
    if (!power) return fail('Je ne trouve aucun pouvoir : Papillon Ombre ne t’a pas écrit en privé (ou tes messages privés sont fermés).');

    const text = (interaction.options.getString('texte') || '').trim();
    if (power.needsText && !text) return fail(`Ajoute un texte : /pouvoir ${power.needsTarget ? 'cible ' : ''}texte`);

    let target = null;
    let caster = member;
    let reflected = '';
    if (power.needsTarget) {
      const user = interaction.options.getUser('cible');
      if (!user) return fail('Choisis une cible : /pouvoir cible:@joueur');
      if (user.bot) return fail('Tu ne peux pas viser un bot.');
      if (user.id === interaction.user.id) return fail('Tu ne peux pas te viser toi-même.');
      if ((shields.get(user.id) || 0) > Date.now()) return fail(`🪨 ${user.username} est en pierre : ton pouvoir glisse sur lui.`);
      try {
        target = await interaction.guild.members.fetch(user.id);
      } catch (_) {
        return fail('Ce joueur n’est pas sur le serveur.');
      }
      // Protection par amok
      const prot = amokOf(target);
      if (prot) {
        if (BLOQUE.includes(prot.key)) return fail(`🛡️ ${target.displayName} est protégé(e) par ${prot.label} : ton pouvoir est annulé.`);
        if (RENVOI.includes(prot.key)) { [caster, target] = [target, caster]; reflected = `🔁 ${prot.label} renvoie le pouvoir ! `; }
        if (prot.key === 'pharaoh') {
          await member.timeout(MIN, 'Pharaoh').catch(() => {});
          return fail('🏺 Pharaoh te gèle 1 minute : sa protection s’est refermée sur toi.');
        }
      }
    }

    const result = await power.run({
      interaction,
      caster,
      target,
      text,
      say: (payload) => interaction.followUp(payload),
    });

    // Amok d'attaque du lanceur : effet en plus du pouvoir
    const mine = amokOf(member);
    if (target && mine && ATTAQUE[mine.key]) await ATTAQUE[mine.key](target, interaction.guild).catch(() => {});

    cooldowns.set(interaction.user.id, Date.now() + COOLDOWN_MS);
    await interaction.editReply({ content: reflected + result });
  } catch (e) {
    if (e instanceof UserError) return fail(e.message);
    if (e.code === 50013) return fail('Je n’ai pas la permission d’agir sur ce joueur : son rôle est plus haut que le mien, ou il manque une permission au bot.');
    if (e.code === 40032) return fail('Ce joueur doit être connecté à un salon vocal.');
    console.error('Erreur /pouvoir :', e);
    return fail('Le pouvoir a échoué.');
  }
});

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('Connexion Discord impossible :', err.message);
});
