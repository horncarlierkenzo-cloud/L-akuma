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
const jaxChaos = require('./jax-chaos');
const siteState = require('./site-state');

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
  console.error('DISCORD_TOKEN manquant : le bot ne se connecte pas.');
  return;
}

const ROLE_NAME = process.env.AKUMA_ROLE || 'Akumatisé';
const COOLDOWN_MS = 20 * 1000;
const cooldowns = new Map();
const MIN = 60 * 1000;

// ---- Amok
const AMOK_PREFIX = 'Amok · ';

const slug = (s) =>
  s.toLowerCase().replace(/\s+/g, '-');

const amokOf = (member) => {
  const role = member.roles.cache.find(
    (x) => x.name.startsWith(AMOK_PREFIX)
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

// Effets supplémentaires des Amoks d'attaque.
const ATTAQUE = {
  stoneheart: async (target) => {
    if (target.voice.channelId) {
      await target.voice.setMute(true, 'Stoneheart');
    }
  },

  'dark-owl': async (target) => {
    await target.send(
      '🦉 Dark Owl t’observe… tu n’es pas seul(e).'
    );
  },

  evillustrator: async (target) => {
    await target.timeout(MIN, 'Evillustrator');
  },

  bubbler: async (target, guild) => {
    const channel = guild.channels.cache.find(
      (x) => x.isVoiceBased() && /bulle/i.test(x.name)
    );

    if (channel && target.voice.channelId) {
      await target.voice.setChannel(channel, 'Bubbler');
    }
  },

  rogercop: async (target, guild) => {
    const channel = guild.channels.cache.find(
      (x) => x.isVoiceBased() && /prison/i.test(x.name)
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

// ---- Commandes
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
        .setDescription('Le texte du pouvoir (si besoin)')
        .setMaxLength(300)
    )
    .toJSON(),

  ...heroes.commandsData.map((command) =>
    command.setDMPermission(false).toJSON()
  ),

  ...jaxChaos.commandsData,
];

// ---- Enregistrement des commandes
async function registerCommands(guild) {
  try {
    await guild.commands.set(commands);

    console.log(
      `${commands.length} commandes enregistrées sur ${guild.name}`
    );
  } catch (error) {
    console.error(
      `Commande non enregistrée sur ${guild.name} : ${error.message}`
    );
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    await registerCommands(guild);
  }
});

client.on(Events.GuildCreate, registerCommands);
client.on('error', console.error);

// ---- Systèmes des personnages
heroes.registerEvents(client);

require('./heroes-akuma').install(client);

jaxChaos.install(client);

client.on(Events.InteractionCreate, (interaction) => {
  heroes.handleInteraction(interaction).catch((error) => {
    console.error('[heroes]', error);
  });
});

// ---- Effets sur les messages
const SANS_EMOJI =
  /[\p{Extended_Pictographic}\p{Emoji_Component}\s]|<a?:\w+:\d+>/gu;

function actif(map, id) {
  const entry = map.get(id);

  if (entry && entry.end <= Date.now()) {
    map.delete(id);
    return null;
  }

  return entry || null;
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

// ---- Recherche du pouvoir attribué
async function findPower(user, guildId) {
  try {
    const special = siteState.getState().akuma[
      `${guildId}:${user.id}`
    ];

    if (
      special &&
      (
        special.jaxChaos === true ||
        special.powerKey === 'jax-chaos'
      )
    ) {
      return {
        label: 'Jax Chaos',
        needsTarget: true,
        needsText: false,

        run: async ({ target }) => {
          await target
            .send(
              '🃏 Jax Chaos vient de déclencher son pouvoir chaotique sur toi…'
            )
            .catch(() => {});

          return `🃏 Jax Chaos a ciblé ${target.displayName} !`;
        },
      };
    }

    const dm = await user.createDM();
    const messages = await dm.messages.fetch({ limit: 50 });

    const mine = [...messages.values()]
      .filter((message) => message.author.id === client.user.id)
      .sort(
        (a, b) => b.createdTimestamp - a.createdTimestamp
      );

    for (const message of mine) {
      const footer =
        message.embeds[0] &&
        message.embeds[0].footer &&
        message.embeds[0].footer.text;

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

    const power = await findPower(
      interaction.user,
      interaction.guildId
    );

    if (!power) {
      return fail(
        'Je ne trouve aucun pouvoir : Papillon Ombre ne t’a pas écrit en privé (ou tes messages privés sont fermés).'
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
        return fail('Choisis une cible : /pouvoir cible:@joueur');
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
      } catch (_) {
        return fail('Ce joueur n’est pas sur le serveur.');
      }

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
            '🏺 Pharaoh te gèle 1 minute : sa protection s’est refermée sur toi.'
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

    const mine = amokOf(member);

    if (target && mine && ATTAQUE[mine.key]) {
      await ATTAQUE[mine.key](target, interaction.guild)
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

    if (error.code === 50013) {
      return fail(
        'Je n’ai pas la permission d’agir sur ce joueur : son rôle est plus haut que le mien, ou il manque une permission au bot.'
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

// ---- Connexion
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error(
    'Connexion Discord impossible :',
    error.message
  );
});

// Export du client pour le panneau web sécurisé.
module.exports = client;
