
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
  console.error('DISCORD_TOKEN manquant : le bot ne se connecte pas.');
  return;
}

const ROLE_NAME = process.env.AKUMA_ROLE || 'Akumatisé';
const COOLDOWN_MS = 20 * 1000;
const cooldowns = new Map();
const MIN = 60 * 1000;

// --------------------------------------------------
// AMOK
// --------------------------------------------------

const AMOK_PREFIX = 'Amok · ';
const slug = (s) => s.toLowerCase().replace(/\s+/g, '-');

const amokOf = (member) => {
  const r = member.roles.cache.find(
    (x) => x.name.startsWith(AMOK_PREFIX)
  );

  return r
    ? {
        label: r.name.slice(AMOK_PREFIX.length),
        key: slug(r.name.slice(AMOK_PREFIX.length)),
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
  stoneheart: async (t) => {
    if (t.voice.channelId) {
      await t.voice.setMute(true, 'Stoneheart');
    }
  },

  'dark-owl': async (t) => {
    await t.send('🦉 Dark Owl t’observe… tu n’es pas seul(e).');
  },

  evillustrator: async (t) => {
    await t.timeout(MIN, 'Evillustrator');
  },

  bubbler: async (t, g) => {
    const c = g.channels.cache.find(
      (x) => x.isVoiceBased() && /bulle/i.test(x.name)
    );

    if (c && t.voice.channelId) {
      await t.voice.setChannel(c, 'Bubbler');
    }
  },

  rogercop: async (t, g) => {
    const c = g.channels.cache.find(
      (x) => x.isVoiceBased() && /prison/i.test(x.name)
    );

    if (c && t.voice.channelId) {
      await t.voice.setChannel(c, 'Rogercop');
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
// COMMANDES SLASH
// --------------------------------------------------

const commands = [
  new SlashCommandBuilder()
    .setName('pouvoir')
    .setDescription('Utilise le pouvoir donné par Papillon Ombre')
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName('cible').setDescription('Le joueur visé')
    )
    .addStringOption((o) =>
      o
        .setName('texte')
        .setDescription('Le texte du pouvoir (si besoin)')
        .setMaxLength(300)
    )
    .toJSON(),

  // Héros Miraculous
  ...heroes.commandsData.map((c) =>
    c.setDMPermission(false).toJSON()
  ),

  // Personnages du Digital Circus
  ...circus.commandsData.map((c) =>
    c.setDMPermission(false).toJSON()
  ),
];

// --------------------------------------------------
// ENREGISTREMENT DES COMMANDES
// --------------------------------------------------

async function registerCommands(guild) {
  try {
    await guild.commands.set(commands);

    console.log(
      `${commands.length} commandes enregistrées sur ${guild.name} : pouvoirs, héros et Digital Circus.`
    );
  } catch (e) {
    console.error(
      `Commande non enregistrée sur ${guild.name} : ${e.message}`
    );
  }
}

// --------------------------------------------------
// DÉMARRAGE DU BOT
// --------------------------------------------------

client.once(Events.ClientReady, async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    await registerCommands(guild);
  }
});

client.on(Events.GuildCreate, registerCommands);
client.on('error', console.error);

// --------------------------------------------------
// ÉVÉNEMENTS DES HÉROS
// --------------------------------------------------

heroes.registerEvents(client);

// --------------------------------------------------
// ÉVÉNEMENTS DES PERSONNAGES DIGITAL CIRCUS
// --------------------------------------------------

circus.registerEvents(client);

// --------------------------------------------------
// AKUMA + LADYBUG
// --------------------------------------------------

require('./heroes-akuma').install(client);

// --------------------------------------------------
// INTERACTIONS DES PERSONNAGES ET DES HÉROS
// --------------------------------------------------

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Panneaux et boutons du Digital Circus.
    await circus.handleInteraction(interaction);

    // Panneaux et boutons des héros Miraculous.
    await heroes.handleInteraction(interaction);
  } catch (e) {
    console.error('[Personnages / Héros]', e);

    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Une erreur est survenue pendant cette interaction.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }
});

// --------------------------------------------------
// EFFETS SUR LES MESSAGES
// Mime, Simon Says, Copycat, Oblivio
// --------------------------------------------------

const SANS_EMOJI =
  /[\p{Extended_Pictographic}\p{Emoji_Component}\s]|<a?:\w+:\d+>/gu;

function actif(map, id) {
  const e = map.get(id);

  if (e && e.end <= Date.now()) {
    map.delete(id);
    return null;
  }

  return e || null;
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

    const s = actif(effects.simon, id);

    if (s) {
      if (
        message.content.trim().toLowerCase() ===
        s.phrase.trim().toLowerCase()
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
  } catch (e) {
    console.error('Effet de message impossible :', e.message);
  }
});

// --------------------------------------------------
// RECHERCHE DU POUVOIR DANS LES MESSAGES PRIVÉS
// --------------------------------------------------

async function findPower(user) {
  try {
    const dm = await user.createDM();
    const msgs = await dm.messages.fetch({ limit: 50 });

    const mine = [...msgs.values()]
      .filter((m) => m.author.id === client.user.id)
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

    for (const m of mine) {
      const footer =
        m.embeds[0] &&
        m.embeds[0].footer &&
        m.embeds[0].footer.text;

      if (!footer) continue;

      const power = POWERS.find(
        (p) => footer === `Pouvoir : ${p.label} · /pouvoir`
      );

      if (power) return power;
    }
  } catch (e) {
    console.error(
      'Lecture des messages privés impossible :',
      e.message
    );
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

    if (
      !member.roles.cache.some((r) => r.name === ROLE_NAME)
    ) {
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
        'Je ne trouve aucun pouvoir : Papillon Ombre ne t’a pas écrit en privé (ou tes messages privés sont fermés).'
      );
    }

    const text = (
      interaction.options.getString('texte') || ''
    ).trim();

    if (power.needsText && !text) {
      return fail(
        `Ajoute un texte : /pouvoir ${power.needsTarget ? 'cible ' : ''}texte`
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

      const prot = amokOf(target);

      if (prot) {
        if (BLOQUE.includes(prot.key)) {
          return fail(
            `🛡️ ${target.displayName} est protégé(e) par ${prot.label} : ton pouvoir est annulé.`
          );
        }

        if (RENVOI.includes(prot.key)) {
          [caster, target] = [target, caster];
          reflected = `🔁 ${prot.label} renvoie le pouvoir ! `;
        }

        if (prot.key === 'pharaoh') {
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
      await ATTAQUE[mine.key](target, interaction.guild).catch(
        () => {}
      );
    }

    cooldowns.set(
      interaction.user.id,
      Date.now() + COOLDOWN_MS
    );

    await interaction.editReply({
      content: reflected + result,
    });
  } catch (e) {
    if (e instanceof UserError) {
      return fail(e.message);
    }

    if (e.code === 50013) {
      return fail(
        'Je n’ai pas la permission d’agir sur ce joueur : son rôle est plus haut que le mien, ou il manque une permission au bot.'
      );
    }

    if (e.code === 40032) {
      return fail(
        'Ce joueur doit être connecté à un salon vocal.'
      );
    }

    console.error('Erreur /pouvoir :', e);
    return fail('Le pouvoir a échoué.');
  }
});

// --------------------------------------------------
// CONNEXION
// --------------------------------------------------

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('Connexion Discord impossible :', err.message);
});

// Permet à server.js de récupérer le client Discord.
module.exports = client;
