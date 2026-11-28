
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
const heroes = require('./heroes');
const circus = require('./circus-characters');

// --------------------------------------------------
// CONFIGURATION
// --------------------------------------------------

const { UserError, shields } = base;
const { effects } = extra;

const ROLE_NAME = process.env.AKUMA_ROLE || 'Akumatisé';
const COOLDOWN_MS = 20 * 1000;
const MIN = 60 * 1000;

const cooldowns = new Map();

if (!process.env.DISCORD_TOKEN) {
  console.error('ERREUR : DISCORD_TOKEN est absent des variables Render.');
  process.exit(1);
}

// --------------------------------------------------
// POUVOIRS
// --------------------------------------------------

const basePowers = Array.isArray(base.POWERS) ? base.POWERS : [];
const extraPowers = Array.isArray(extra.POWERS) ? extra.POWERS : [];

const POWERS = [
  ...basePowers.filter(
    (p) => !extraPowers.some((e) => e.key === p.key)
  ),
  ...extraPowers,
];

// --------------------------------------------------
// AMOK
// --------------------------------------------------

const AMOK_PREFIX = 'Amok · ';
const slug = (s) => s.toLowerCase().replace(/\s+/g, '-');

const amokOf = (member) => {
  const role = member.roles.cache.find(
    (r) => r.name.startsWith(AMOK_PREFIX)
  );

  return role
    ? {
        label: role.name.slice(AMOK_PREFIX.length),
        key: slug(role.name.slice(AMOK_PREFIX.length)),
      }
    : null;
};

const BLOQUE = [
  'princess-fragrance',
  'antibug',
  'sandboy',
  'miraculous-queen',
];

const RENVOI = ['reflekta', 'timebreaker'];

const ATTAQUE = {
  stoneheart: async (target) => {
    if (target.voice.channelId) {
      await target.voice.setMute(true, 'Stoneheart');
    }
  },

  'dark-owl': async (target) => {
    await target.send('🦉 Dark Owl t’observe… tu n’es pas seul(e).');
  },

  evillustrator: async (target) => {
    await target.timeout(MIN, 'Evillustrator');
  },

  bubbler: async (target, guild) => {
    const channel = guild.channels.cache.find(
      (c) => c.isVoiceBased() && /bulle/i.test(c.name)
    );

    if (channel && target.voice.channelId) {
      await target.voice.setChannel(channel, 'Bubbler');
    }
  },

  rogercop: async (target, guild) => {
    const channel = guild.channels.cache.find(
      (c) => c.isVoiceBased() && /prison/i.test(c.name)
    );

    if (channel && target.voice.channelId) {
      await target.voice.setChannel(channel, 'Rogercop');
    }
  },
};

// --------------------------------------------------
// CLIENT DISCORD
// --------------------------------------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// --------------------------------------------------
// COMMANDES
// --------------------------------------------------

const commands = [
  new SlashCommandBuilder()
    .setName('pouvoir')
    .setDescription('Utilise le pouvoir donné par Papillon Ombre')
    .setDMPermission(false)
    .addUserOption((option) =>
      option
        .setName('cible')
        .setDescription('Le joueur visé')
    )
    .addStringOption((option) =>
      option
        .setName('texte')
        .setDescription('Le texte du pouvoir')
        .setMaxLength(300)
    )
    .toJSON(),

  ...(heroes.commandsData || []).map((command) =>
    command.setDMPermission(false).toJSON()
  ),

  ...(circus.commandsData || []).map((command) =>
    command.setDMPermission(false).toJSON()
  ),
];

// --------------------------------------------------
// ENREGISTREMENT DES COMMANDES
// --------------------------------------------------

async function registerCommands(guild) {
  try {
    await guild.commands.set(commands);
    console.log(`Commandes enregistrées sur ${guild.name}.`);
  } catch (error) {
    console.error(
      `Erreur d'enregistrement des commandes : ${error.message}`
    );
  }
}

// --------------------------------------------------
// CONNEXION DU BOT
// --------------------------------------------------

client.once(Events.ClientReady, async () => {
  console.log(`Bot connecté : ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    await registerCommands(guild);
  }
});

client.on(Events.GuildCreate, registerCommands);
client.on('error', console.error);

// --------------------------------------------------
// ÉVÉNEMENTS DES HÉROS
// --------------------------------------------------

if (typeof heroes.registerEvents === 'function') {
  heroes.registerEvents(client);
}

// --------------------------------------------------
// ÉVÉNEMENTS DU DIGITAL CIRCUS
// --------------------------------------------------

if (typeof circus.registerEvents === 'function') {
  circus.registerEvents(client);
}

// --------------------------------------------------
// SYSTÈME AKUMA DES HÉROS
// --------------------------------------------------

try {
  const heroesAkuma = require('./heroes-akuma');

  if (typeof heroesAkuma.install === 'function') {
    heroesAkuma.install(client);
  }
} catch (error) {
  console.error('[Heroes Akuma]', error);
}

// --------------------------------------------------
// INTERACTIONS DES PERSONNAGES
// --------------------------------------------------

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (typeof circus.handleInteraction === 'function') {
      await circus.handleInteraction(interaction);
    }

    if (typeof heroes.handleInteraction === 'function') {
      await heroes.handleInteraction(interaction);
    }
  } catch (error) {
    console.error('[Personnages]', error);

    if (
      interaction.isRepliable() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction.reply({
        content: 'Une erreur est survenue pendant cette interaction.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }
});

// --------------------------------------------------
// EFFETS SUR LES MESSAGES
// --------------------------------------------------

const SANS_EMOJI =
  /[\p{Extended_Pictographic}\p{Emoji_Component}\s]|<a?:\w+:\d+>/gu;

function actif(map, id) {
  const effect = map.get(id);

  if (effect && effect.end <= Date.now()) {
    map.delete(id);
    return null;
  }

  return effect || null;
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.inGuild()) return;

  if (!effects) return;

  const id = message.author.id;

  try {
    if (actif(effects.oblivio, id)) {
      await message.delete();
      return;
    }

    if (
      actif(effects.mime, id) &&
      message.content.replace(SANS_EMOJI, '').length
    ) {
      await message.delete();
      return;
    }

    const simon = actif(effects.simon, id);

    if (simon) {
      if (
        message.content.trim().toLowerCase() ===
        simon.phrase.trim().toLowerCase()
      ) {
        effects.simon.delete(id);
      } else {
        await message.delete();
        return;
      }
    }

    if (actif(effects.copycat, id) && message.content) {
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({
              name: message.member
                ? message.member.displayName
                : message.author.username,
              iconURL: message.author.displayAvatarURL(),
            })
            .setDescription(message.content.slice(0, 1500))
            .setColor(0x7b2cbf)
            .setFooter({ text: '🐱 Copycat' }),
        ],
      });
    }
  } catch (error) {
    console.error('[Effets messages]', error.message);
  }
});

// --------------------------------------------------
// RECHERCHE DU POUVOIR EN MESSAGE PRIVÉ
// --------------------------------------------------

async function findPower(user) {
  try {
    const dm = await user.createDM();
    const messages = await dm.messages.fetch({ limit: 50 });

    const mine = [...messages.values()]
      .filter((message) => message.author.id === client.user.id)
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

    for (const message of mine) {
      const footer =
        message.embeds[0]?.footer?.text;

      if (!footer) continue;

      const power = POWERS.find(
        (p) => footer === `Pouvoir : ${p.label} · /pouvoir`
      );

      if (power) return power;
    }
  } catch (error) {
    console.error('[Recherche pouvoir]', error.message);
  }

  return null;
}

// --------------------------------------------------
// COMMANDE /POUVOIR
// --------------------------------------------------

client.on(Events.InteractionCreate, async (interaction) => {
  if (
    !interaction.isChatInputCommand() ||
    interaction.commandName !== 'pouvoir'
  ) {
    return;
  }

  if (!interaction.inGuild()) return;

  const fail = async (content) => {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content }).catch(() => {});
    } else {
      await interaction.reply({
        content,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  };

  try {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const member = interaction.member;

    if (!member.roles.cache.some((role) => role.name === ROLE_NAME)) {
      return fail(
        `Tu n’es pas akumatisé : il faut le rôle « ${ROLE_NAME} ».`
      );
    }

    const wait =
      (cooldowns.get(interaction.user.id) || 0) - Date.now();

    if (wait > 0) {
      return fail(
        `Ton pouvoir se recharge : encore ${Math.ceil(wait / 1000)} secondes.`
      );
    }

    const power = await findPower(interaction.user);

    if (!power) {
      return fail(
        'Je ne trouve aucun pouvoir dans tes messages privés.'
      );
    }

    const text = (
      interaction.options.getString('texte') || ''
    ).trim();

    if (power.needsText && !text) {
      return fail('Ajoute le texte demandé pour utiliser ton pouvoir.');
    }

    let target = null;
    let caster = member;
    let reflected = '';

    if (power.needsTarget) {
      const user = interaction.options.getUser('cible');

      if (!user) {
        return fail('Choisis une cible avec /pouvoir cible.');
      }

      if (user.bot) {
        return fail('Tu ne peux pas viser un bot.');
      }

      if (user.id === interaction.user.id) {
        return fail('Tu ne peux pas te viser toi-même.');
      }

      if ((shields.get(user.id) || 0) > Date.now()) {
        return fail(
          `🪨 ${user.username} est protégé(e) : ton pouvoir est bloqué.`
        );
      }

      try {
        target = await interaction.guild.members.fetch(user.id);
      } catch {
        return fail('Ce joueur ne se trouve pas sur le serveur.');
      }

      const protection = amokOf(target);

      if (protection) {
        if (BLOQUE.includes(protection.key)) {
          return fail(
            `🛡️ ${target.displayName} est protégé(e) par ${protection.label}.`
          );
        }

        if (RENVOI.includes(protection.key)) {
          [caster, target] = [target, caster];
          reflected = `🔁 ${protection.label} renvoie le pouvoir ! `;
        }

        if (protection.key === 'pharaoh') {
          await member.timeout(MIN, 'Pharaoh').catch(() => {});

          return fail(
            '🏺 La protection de Pharaoh a bloqué ton pouvoir.'
          );
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

    const ownAmok = amokOf(member);

    if (target && ownAmok && ATTAQUE[ownAmok.key]) {
      await ATTAQUE[ownAmok.key](target, interaction.guild)
        .catch(() => {});
    }

    cooldowns.set(
      interaction.user.id,
      Date.now() + COOLDOWN_MS
    );

    await interaction.editReply({
      content: reflected + result,
    });
  } catch (error) {
    if (error instanceof UserError) {
      return fail(error.message);
    }

    console.error('Erreur /pouvoir :', error);

    return fail('Le pouvoir n’a pas pu être utilisé.');
  }
});

// --------------------------------------------------
// CONNEXION
// --------------------------------------------------

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error('Erreur de connexion Discord :', error);
});

// Export utilisé par server.js
module.exports = client;
