
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

const { UserError, shields } = base;
const { effects } = extra;

// Les pouvoirs de powers-extra remplacent ceux de même clé.
const POWERS = [
  ...base.POWERS.filter(
    (p) => !extra.POWERS.some((e) => e.key === p.key)
  ),
  ...extra.POWERS,
];

if (!process.env.DISCORD_TOKEN) {
  throw new Error('DISCORD_TOKEN manquant dans les variables de Render.');
}

const ROLE_NAME = process.env.AKUMA_ROLE || 'Akumatisé';
const COOLDOWN_MS = 20 * 1000;
const cooldowns = new Map();
const MIN = 60 * 1000;

// ---- Amok : rôles attribués par le panneau du site
const AMOK_PREFIX = 'Amok · ';

const slug = (s) =>
  s.toLowerCase().replace(/\s+/g, '-');

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

const RENVOI = [
  'reflekta',
  'timebreaker',
];

// Effets supplémentaires des amoks d'attaque.
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

// ---- Client Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ---- Commandes du bot
const pouvoirCommand = new SlashCommandBuilder()
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
      .setDescription('Le texte du pouvoir, si nécessaire')
      .setMaxLength(300)
  );

// Commandes Miraculous.
const heroCommands = heroes.commandsData.map((command) => {
  if (typeof command.setDMPermission === 'function') {
    command.setDMPermission(false);
  }

  return typeof command.toJSON === 'function'
    ? command.toJSON()
    : command;
});

// Commandes Digital Circus : Caine, Pomni, Ragatha,
// Jax, Zooble, Gangle et Kinger.
if (!Array.isArray(circus.commandsData)) {
  throw new Error(
    'circus-characters.js doit exporter un tableau commandsData.'
  );
}

const circusCommands = circus.commandsData.map((command) => {
  if (typeof command.setDMPermission === 'function') {
    command.setDMPermission(false);
  }

  return typeof command.toJSON === 'function'
    ? command.toJSON()
    : command;
});

const commands = [
  pouvoirCommand.toJSON(),
  ...heroCommands,
  ...circusCommands,
];

// ---- Enregistrement des commandes
async function registerCommands(guild) {
  try {
    await guild.commands.set(commands);

    console.log(
      `${commands.length} commandes enregistrées sur ${guild.name} : pouvoirs, Miraculous et Digital Circus.`
    );
  } catch (error) {
    console.error(
      `Erreur d'enregistrement des commandes sur ${guild.name} :`,
      error
    );
  }
}

// ---- Connexion
client.once(Events.ClientReady, async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    await registerCommands(guild);
  }
});

client.on(Events.GuildCreate, registerCommands);
client.on('error', console.error);

// ---- Événements des héros Miraculous
if (typeof heroes.registerEvents === 'function') {
  heroes.registerEvents(client);
}

// ---- Événements du Digital Circus
if (typeof circus.registerEvents === 'function') {
  circus.registerEvents(client);
}

// ---- Règles akuma et Miraculous Ladybug
require('./heroes-akuma').install(client);

// ---- Interactions des personnages et des panneaux
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (typeof circus.handleInteraction === 'function') {
      await circus.handleInteraction(interaction);
    }
  } catch (error) {
    console.error('[Digital Circus]', error);
  }

  try {
    if (typeof heroes.handleInteraction === 'function') {
      await heroes.handleInteraction(interaction);
    }
  } catch (error) {
    console.error('[Miraculous]', error);
  }
});

// ---- Effets sur les messages
// Mime, Simon Says, Copycat et Oblivio.
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

  const id = message.author.id;

  try {
    if (actif(effects.oblivio, id)) {
      return void (await message.delete());
    }

    if (
      actif(effects.mime, id) &&
      message.content.replace(SANS_EMOJI, '').length
    ) {
      return void (await message.delete());
    }

    const simon = actif(effects.simon, id);

    if (simon) {
      if (
        message.content.trim().toLowerCase() ===
        simon.phrase.trim().toLowerCase()
      ) {
        effects.simon.delete(id);
      } else {
        return void (await message.delete());
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
    console.error(
      'Effet de message impossible :',
      error.message
    );
  }
});

// ---- Recherche du pouvoir reçu en message privé
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
    console.error(
      'Lecture des messages privés impossible :',
      error.message
    );
  }

  return null;
}

// ---- Commande /pouvoir
client.on(Events.InteractionCreate, async (interaction) => {
  if (
    !interaction.isChatInputCommand() ||
    interaction.commandName !== 'pouvoir'
  ) {
    return;
  }

  if (!interaction.inGuild()) return;

  const fail = async (content) => {
    await interaction.deleteReply().catch(() => {});

    await interaction.followUp({
      content,
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  };

  try {
    await interaction.deferReply();

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
        `Ton pouvoir se recharge : encore ${Math.ceil(wait / 1000)} s.`
      );
    }

    const power = await findPower(interaction.user);

    if (!power) {
      return fail(
        'Je ne trouve aucun pouvoir : Papillon Ombre ne t’a pas écrit en privé, ou tes messages privés sont fermés.'
      );
    }

    const text = (
      interaction.options.getString('texte') || ''
    ).trim();

    if (power.needsText && !text) {
      return fail(
        `Ajoute un texte : /pouvoir ${
          power.needsTarget ? 'cible ' : ''
        }texte`
      );
    }

    let target = null;
    let caster = member;
    let reflected = '';

    if (power.needsTarget) {
      const user = interaction.options.getUser('cible');

      if (!user) {
        return fail('Choisis une cible avec /pouvoir cible:@joueur');
      }

      if (user.bot) {
        return fail('Tu ne peux pas viser un bot.');
      }

      if (user.id === interaction.user.id) {
        return fail('Tu ne peux pas te viser toi-même.');
      }

      if ((shields.get(user.id) || 0) > Date.now()) {
        return fail(
          `🪨 ${user.username} est en pierre : ton pouvoir glisse sur lui.`
        );
      }

      try {
        target = await interaction.guild.members.fetch(user.id);
      } catch {
        return fail('Ce joueur n’est pas sur le serveur.');
      }

      // Protection par amok.
      const protection = amokOf(target);

      if (protection) {
        if (BLOQUE.includes(protection.key)) {
          return fail(
            `🛡️ ${target.displayName} est protégé(e) par ${protection.label} : ton pouvoir est annulé.`
          );
        }

        if (RENVOI.includes(protection.key)) {
          [caster, target] = [target, caster];

          reflected = `🔁 ${protection.label} renvoie le pouvoir ! `;
        }

        if (protection.key === 'pharaoh') {
          await member.timeout(MIN, 'Pharaoh').catch(() => {});

          return fail(
            '🏺 Pharaoh te bloque pendant une minute : sa protection s’est refermée sur toi.'
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

    // Effet supplémentaire de l'amok du lanceur.
    const mine = amokOf(member);

    if (target && mine && ATTAQUE[mine.key]) {
      await ATTAQUE[mine.key](
        target,
        interaction.guild
      ).catch(() => {});
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

    if (error.code === 50013) {
      return fail(
        'Je n’ai pas la permission d’agir sur ce joueur : son rôle est peut-être plus haut que le mien.'
      );
    }

    if (error.code === 40032) {
      return fail(
        'Ce joueur doit être connecté à un salon vocal.'
      );
    }

    console.error('Erreur /pouvoir :', error);

    return fail('Le pouvoir a échoué.');
  }
});

// ---- Connexion du bot
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error(
    'Connexion Discord impossible :',
    error.message
  );
});

// Permet à server.js de récupérer le client Discord.
module.exports = client;
