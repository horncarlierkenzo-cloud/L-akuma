'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags
} = require('discord.js');

const state = require('./site-state');

const ROLE_NAME = process.env.AKUMA_ROLE || 'Akumatisé';
const EPH = MessageFlags.Ephemeral;

// --------------------------------------------------
// PERSONNAGES DU DIGITAL CIRCUS
// --------------------------------------------------

const characters = {
  pomni: {
    name: 'Pomni',
    emoji: '🤡',
    color: 0xe85d75,
    question: 'Dans quel univers êtes-vous coincés ?',
    answer: ['digital circus', 'the amazing digital circus'],
    fragment: 'Fragment de l’exploration',
    task: 'Explorer le cirque et identifier le monde dans lequel vous êtes piégés.'
  },

  ragatha: {
    name: 'Ragatha',
    emoji: '🧵',
    color: 0xe78aa8,
    question: 'Quel mot permet au groupe de réussir ensemble ?',
    answer: ['entraide', 'cooperation', 'coopération'],
    fragment: 'Fragment de l’entraide',
    task: 'Rassembler les participants et retrouver le mot qui unit le groupe.'
  },

  gangle: {
    name: 'Gangle',
    emoji: '🎭',
    color: 0xe8a1d1,
    question: 'Quel objet représente le mieux Gangle ?',
    answer: ['masque'],
    fragment: 'Fragment de la créativité',
    task: 'Résoudre l’énigme du masque et de ses émotions.'
  },

  zooble: {
    name: 'Zooble',
    emoji: '🧩',
    color: 0x9b8de5,
    question: 'Que faut-il réunir pour reconstruire un objet ?',
    answer: ['pieces', 'pièces', 'des pieces', 'des pièces'],
    fragment: 'Fragment de la réparation',
    task: 'Retrouver les pièces manquantes et réparer un élément du décor.'
  },

  kinger: {
    name: 'Kinger',
    emoji: '♟️',
    color: 0xb9a7e8,
    question: 'Quel personnage est le maître du cirque ?',
    answer: ['caine'],
    fragment: null,
    task: 'Déchiffrer les indices et révéler un secret du cirque.'
  },

  caine: {
    name: 'Caine',
    emoji: '🎪',
    color: 0xf0c34e,
    question: 'Quel est le nom du cirque ?',
    answer: ['digital circus', 'the amazing digital circus'],
    fragment: null,
    task: 'Lancer les annonces et guider les joueurs dans les missions.'
  }
};

// --------------------------------------------------
// PROTECTIONS
// --------------------------------------------------

const protectedName =
  /(admin|administr|staff|moder|mod-log|journal|logs?|ticket|reglement|règlement|rules|verification|vérification|bot-commands)/i;

const characterHolders = new Map();

// --------------------------------------------------
// COMMANDES SLASH
// --------------------------------------------------

const commandsData = [
  new SlashCommandBuilder()
    .setName('jax')
    .setDescription('Ouvrir le panneau privé de Jax Chaos')
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('evenement2')
    .setDescription('Démarrer ou arrêter le crossover')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option
        .setName('action')
        .setDescription('Action à effectuer')
        .setRequired(true)
        .addChoices(
          { name: 'Démarrer', value: 'start' },
          { name: 'Arrêter', value: 'stop' }
        )
    )
    .addChannelOption(option =>
      option
        .setName('salon')
        .setDescription('Salon pour publier l’annonce')
    ),

  ...Object.entries(characters).map(([key, character]) =>
    new SlashCommandBuilder()
      .setName(key)
      .setDescription(`Ouvrir le panneau privé de ${character.name}`)
      .setDMPermission(false)
  )
].map(command => command.toJSON());

// --------------------------------------------------
// JOURNAL
// --------------------------------------------------

function log(message, type = 'jax') {
  state.addLog(message, true, type);
}

// --------------------------------------------------
// VÉRIFICATION DE JAX
// --------------------------------------------------

function isJax(member, guildId) {
  if (!member || !member.roles || !member.roles.cache) {
    return false;
  }

  const entry =
    state.getState().akuma[`${guildId}:${member.id}`];

  return Boolean(
    entry &&
    (
      entry.jaxChaos === true ||
      entry.powerKey === 'jax-chaos'
    ) &&
    member.roles.cache.some(role => role.name === ROLE_NAME)
  );
}

// --------------------------------------------------
// SAUVEGARDE DU SERVEUR
// --------------------------------------------------

function snapshotGuild(guild) {
  const channels = [...guild.channels.cache.values()].map(channel => ({
    id: channel.id,
    name: channel.name,
    type: channel.type,
    parentId: channel.parentId || null,
    position: channel.rawPosition ?? channel.position ?? 0,

    topic: 'topic' in channel ? channel.topic : null,
    nsfw: 'nsfw' in channel ? channel.nsfw : false,

    rateLimitPerUser:
      'rateLimitPerUser' in channel
        ? channel.rateLimitPerUser
        : 0,

    bitrate: channel.isVoiceBased()
      ? channel.bitrate
      : null,

    userLimit: channel.isVoiceBased()
      ? channel.userLimit
      : null,

    permissionOverwrites: channel.permissionOverwrites
      ? channel.permissionOverwrites.cache.map(overwrite => ({
          id: overwrite.id,
          type: overwrite.type,
          allow: overwrite.allow.bitfield.toString(),
          deny: overwrite.deny.bitfield.toString()
        }))
      : []
  }));

  return {
    guildName: guild.name,
    description: guild.description || null,

    iconURL: guild.iconURL({
      extension: 'png',
      size: 1024
    }),

    channels,
    capturedAt: Date.now()
  };
}

function ensureSnapshot(guild) {
  const event = state.getState().event;

  if (!event.snapshot) {
    state.setEvent({
      snapshot: snapshotGuild(guild),
      createdChannels: [],
      changedByJax: []
    });

    log(
      '🧩 Sauvegarde initiale du serveur créée avant la corruption.',
      'backup'
    );
  }
}

// --------------------------------------------------
// NETTOYAGE DES NOMS
// --------------------------------------------------

function cleanName(value) {
  const name = String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\- ̷̸̶]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 95);

  if (!name) {
    throw new Error('Le nom de salon est vide ou invalide.');
  }

  return name;
}

// --------------------------------------------------
// RESTAURATION DU SERVEUR PAR LADYBUG
// --------------------------------------------------

async function restoreServer(guild) {
  const event = state.getState().event;
  const snapshot = event.snapshot;

  if (!snapshot) {
    return {
      restored: 0,
      missing: 0,
      message: 'Aucune sauvegarde de corruption trouvée.'
    };
  }

  let restored = 0;
  let missing = 0;

  // Restaurer le nom du serveur.
  try {
    if (guild.name !== snapshot.guildName) {
      await guild.setName(
        snapshot.guildName,
        'Lucky Charm de Ladybug'
      );

      restored++;
    }
  } catch (error) {
    log(
      `⚠️ Nom du serveur non restauré : ${error.message}`,
      'repair-error'
    );
  }

  // Restaurer la description.
  try {
    if (
      typeof guild.edit === 'function' &&
      (guild.description || null) !==
        (snapshot.description || null)
    ) {
      await guild.edit({
        description: snapshot.description || null,
        reason: 'Lucky Charm de Ladybug'
      });

      restored++;
    }
  } catch (error) {
    log(
      `⚠️ Description du serveur non restaurée : ${error.message}`,
      'repair-error'
    );
  }

  const restoredIds = new Map();

  const orderedChannels = [...snapshot.channels].sort(
    (a, b) =>
      (
        a.type === ChannelType.GuildCategory ? 0 : 1
      ) -
      (
        b.type === ChannelType.GuildCategory ? 0 : 1
      )
  );

  for (const original of orderedChannels) {
    let channel = guild.channels.cache.get(original.id);

    // Recréer un salon supprimé.
    if (!channel) {
      try {
        channel = await guild.channels.create({
          name: original.name,
          type: original.type,

          parent:
            restoredIds.get(original.parentId) ||
            original.parentId ||
            undefined,

          topic: original.topic || undefined,
          nsfw: original.nsfw,
          rateLimitPerUser: original.rateLimitPerUser || 0,
          bitrate: original.bitrate || undefined,
          userLimit: original.userLimit || undefined,

          permissionOverwrites:
            original.permissionOverwrites.map(overwrite => ({
              id: overwrite.id,
              type: overwrite.type,
              allow: BigInt(overwrite.allow),
              deny: BigInt(overwrite.deny)
            })),

          reason: 'Lucky Charm de Ladybug — recréation'
        });

        restored++;

        if (channel) {
          restoredIds.set(original.id, channel.id);
        }
      } catch (error) {
        missing++;

        log(
          `⚠️ Salon ${original.name} impossible à recréer : ${error.message}`,
          'repair-error'
        );
      }

      continue;
    }

    try {
      if (channel.name !== original.name) {
        await channel.setName(
          original.name,
          'Lucky Charm de Ladybug'
        );
      }

      if (
        'topic' in channel &&
        (channel.topic || null) !== original.topic
      ) {
        await channel.setTopic(
          original.topic,
          'Lucky Charm de Ladybug'
        );
      }

      const wantedParent =
        restoredIds.get(original.parentId) ||
        original.parentId;

      if (
        channel.parentId !== wantedParent &&
        wantedParent
      ) {
        await channel.setParent(wantedParent, {
          lockPermissions: false,
          reason: 'Lucky Charm de Ladybug'
        });
      }

      if (
        original.permissionOverwrites?.length &&
        channel.permissionOverwrites
      ) {
        await channel.permissionOverwrites
          .set(
            original.permissionOverwrites.map(overwrite => ({
              id: overwrite.id,
              type: overwrite.type,
              allow: BigInt(overwrite.allow),
              deny: BigInt(overwrite.deny)
            })),
            'Lucky Charm de Ladybug'
          )
          .catch(() => {});
      }

      if (channel.position !== original.position) {
        await channel
          .setPosition(original.position)
          .catch(() => {});
      }

      restoredIds.set(original.id, channel.id);
      restored++;

    } catch (error) {
      log(
        `⚠️ Salon ${original.name} partiellement restauré : ${error.message}`,
        'repair-error'
      );
    }
  }

  // Supprimer les salons temporaires créés par Jax.
  for (const id of event.createdChannels || []) {
    const channel = guild.channels.cache.get(id);

    if (!channel) continue;

    try {
      await channel.delete(
        'Lucky Charm de Ladybug — suppression du décor temporaire'
      );

      restored++;
    } catch (_) {
      missing++;
    }
  }

  state.setEvent({
    snapshot: null,
    createdChannels: [],
    changedByJax: [],
    stage: 'réparé'
  });

  log(
    `🐞 Lucky Charm : ${restored} élément(s) restauré(s), ${missing} élément(s) à vérifier.`,
    'repair'
  );

  return { restored, missing };
}

// --------------------------------------------------
// PANNEAU PRIVÉ DES PERSONNAGES
// --------------------------------------------------

function privatePanel(characterKey) {
  const character = characters[characterKey];
  const event = state.getState().event;

  const fragmentsUnlocked =
    event.fragmentsUnlocked === true ||
    event.stage === 'chaos';

  const description = fragmentsUnlocked
    ? `**Mission :** ${character.task}\n\nRéponds à l’énigme pour faire valider automatiquement ta progression.\n\n**Énigme :** ${character.question}`
    : `**Mission :** ${character.task}\n\n🔒 Les fragments du Lucky Charm sont encore verrouillés.\n\nCaine doit d’abord lancer le jeu et Jax doit être akumatisé pour débloquer les missions de fragments.`;

  const embed = new EmbedBuilder()
    .setColor(character.color)
    .setTitle(`${character.emoji} ${character.name} — Panneau personnel`)
    .setDescription(description)
    .addFields({
      name: 'Progression collective',
      value: `${(event.fragments || []).length}/4 fragments du Lucky Charm`
    })
    .setFooter({
      text: 'Panneau privé • tes réponses sont vérifiées par le bot'
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`circus:answer:${characterKey}`)
      .setLabel(
        fragmentsUnlocked
          ? 'Répondre à l’énigme'
          : 'Fragments verrouillés'
      )
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔎')
      .setDisabled(!fragmentsUnlocked || !character.fragment),

    new ButtonBuilder()
      .setCustomId('circus:progress')
      .setLabel('Voir la progression')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`circus:release:${characterKey}`)
      .setLabel('Libérer le personnage')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [row],
    flags: EPH
  };
}

// --------------------------------------------------
// PANNEAU PRIVÉ DE JAX
// --------------------------------------------------

function jaxPanel(member) {
  const event = state.getState().event;

  const amokRole = member.roles.cache.find(
    role => role.name.startsWith('Amok · ')
  );

  const embed = new EmbedBuilder()
    .setColor(0x9b59d0)
    .setTitle('🐰 JAX CHAOS — CONSOLE DE CORRUPTION')
    .setDescription(
      'Le cirque est à toi. Choisis une action de décor. Les changements sont sauvegardés pour le Lucky Charm.\n\nTon Amok accompagne tes pouvoirs : utilise **/pouvoir cible:@membre** pour déclencher son effet associé.'
    )
    .addFields(
      {
        name: 'Amok lié',
        value: amokRole
          ? `🪶 ${amokRole.name.slice(7)} — son effet reste actif avec les mécaniques habituelles.`
          : 'Aucun Amok attribué pour le moment.'
      },
      {
        name: 'Identité du serveur',
        value: 'Nom • description du serveur'
      },
      {
        name: 'Décor',
        value: 'Renommer un salon • changer son sujet • créer un salon texte/vocal • dupliquer un salon • verrouiller/déverrouiller'
      },
      {
        name: 'Corruption',
        value: 'Glitch léger • corruption • erreur système • chaos violet'
      },
      {
        name: 'Sauvegarde',
        value: event.snapshot
          ? '✅ Sauvegarde active'
          : '⚪ Elle sera créée avant la première action'
      }
    )
    .setFooter({
      text: 'Accès réservé au Jax Chaos akumatisé pendant l’événement'
    });

  const menu = new StringSelectMenuBuilder()
    .setCustomId('jax:action')
    .setPlaceholder('Choisir un pouvoir de corruption')
    .addOptions(
      {
        label: 'Renommer le serveur',
        value: 'guild-name',
        emoji: '🌀'
      },
      {
        label: 'Modifier la description',
        value: 'guild-description',
        emoji: '📝'
      },
      {
        label: 'Renommer un salon (glitch)',
        value: 'channel-name',
        emoji: '💜'
      },
      {
        label: 'Modifier le sujet d’un salon',
        value: 'channel-topic',
        emoji: '📡'
      },
      {
        label: 'Créer un salon texte',
        value: 'create-text',
        emoji: '➕'
      },
      {
        label: 'Créer un salon vocal',
        value: 'create-voice',
        emoji: '🔊'
      },
      {
        label: 'Créer une catégorie',
        value: 'create-category',
        emoji: '🗂️'
      },
      {
        label: 'Dupliquer un salon',
        value: 'clone-channel',
        emoji: '🪞'
      },
      {
        label: 'Verrouiller un salon',
        value: 'lock-channel',
        emoji: '🔒'
      },
      {
        label: 'Déverrouiller un salon',
        value: 'unlock-channel',
        emoji: '🔓'
      },
      {
        label: 'Déplacer un salon',
        value: 'move-channel',
        emoji: '↪️'
      },
      {
        label: 'Changer sa position',
        value: 'channel-position',
        emoji: '↕️'
      },
      {
        label: 'Supprimer un salon (confirmation)',
        value: 'delete-channel',
        emoji: '🗑️'
      }
    );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(menu)
    ],
    flags: EPH
  };
}

// --------------------------------------------------
// STYLES DE CORRUPTION
// --------------------------------------------------

function glitch(text, style) {
  const source = String(text || '').slice(0, 80);

  if (style === 'corruption') {
    return [...source]
      .map((character, index) =>
        index % 2
          ? character + '̷'
          : character + '̸'
      )
      .join('')
      .slice(0, 95);
  }

  if (style === 'circus') {
    return `✦・${source}・✦`.slice(0, 95);
  }

  if (style === 'error') {
    return `ERROR_${source}`.slice(0, 95);
  }

  if (style === 'chaos') {
    return `⛧-${source}-⛧`.slice(0, 95);
  }

  return [...source]
    .map((character, index) =>
      index % 3 === 0
        ? character + '̶'
        : character
    )
    .join('')
    .slice(0, 95);
}

// --------------------------------------------------
// ACTIONS DE JAX
// --------------------------------------------------

async function executeJax(interaction, action, values) {
  const guild = interaction.guild;

  ensureSnapshot(guild);

  const botMember = guild.members.me;

  if (
    !botMember ||
    !botMember.permissions.has(PermissionFlagsBits.ManageChannels) ||
    !botMember.permissions.has(PermissionFlagsBits.ManageGuild)
  ) {
    throw new Error(
      'Le bot doit avoir les permissions Gérer les salons et Gérer le serveur.'
    );
  }

  const value = String(values.value || '').trim();
  const channelId = String(values.channelId || '').trim();

  if (action === 'guild-name') {
    if (!value) {
      throw new Error('Saisis un nom.');
    }

    await guild.setName(
      glitch(value, String(values.style || 'glitch')).slice(0, 100),
      'Pouvoir Jax Chaos'
    );
  }

  else if (action === 'guild-description') {
    if (typeof guild.edit !== 'function') {
      throw new Error(
        'Cette fonction n’est pas disponible avec cette version de Discord.'
      );
    }

    await guild.edit({
      description: glitch(
        value,
        String(values.style || 'glitch')
      ).slice(0, 120),

      reason: 'Pouvoir Jax Chaos'
    });
  }

  else if (
    action === 'channel-name' ||
    action === 'channel-topic' ||
    action === 'lock-channel' ||
    action === 'unlock-channel' ||
    action === 'clone-channel' ||
    action === 'delete-channel' ||
    action === 'move-channel' ||
    action === 'channel-position'
  ) {
    const channel = await guild.channels
      .fetch(channelId)
      .catch(() => null);

    if (!channel) {
      throw new Error('Salon introuvable.');
    }

    if (protectedName.test(channel.name)) {
      throw new Error(
        'Ce salon est protégé et ne peut pas être modifié par Jax.'
      );
    }

    if (action === 'channel-name') {
      const raw = cleanName(value);
      const style = String(values.style || 'glitch');

      await channel.setName(
        cleanName(glitch(raw, style)),
        'Pouvoir Jax Chaos'
      );
    }

    if (action === 'channel-topic') {
      if (!('setTopic' in channel)) {
        throw new Error(
          'Ce salon ne possède pas de description.'
        );
      }

      await channel.setTopic(
        value.slice(0, 1024),
        'Pouvoir Jax Chaos'
      );
    }

    if (action === 'lock-channel') {
      await channel.permissionOverwrites.edit(
        guild.roles.everyone,
        {
          SendMessages: false,
          Connect: false
        },
        {
          reason: 'Pouvoir Jax Chaos'
        }
      );
    }

    if (action === 'unlock-channel') {
      await channel.permissionOverwrites.edit(
        guild.roles.everyone,
        {
          SendMessages: null,
          Connect: null
        },
        {
          reason: 'Pouvoir Jax Chaos'
        }
      );
    }

    if (action === 'clone-channel') {
      const clone = await channel.clone({
        name: cleanName(glitch(channel.name, 'circus')),
        reason: 'Pouvoir Jax Chaos'
      });

      const current = state.getState().event;

      state.setEvent({
        createdChannels: [
          ...(current.createdChannels || []),
          clone.id
        ]
      });
    }

    if (action === 'delete-channel') {
      throw new Error(
        'Utilise le bouton de confirmation dédié après avoir vérifié le salon.'
      );
    }

    if (action === 'move-channel') {
      const category = await guild.channels
        .fetch(value)
        .catch(() => null);

      if (
        !category ||
        category.type !== ChannelType.GuildCategory
      ) {
        throw new Error(
          'Indique l’ID d’une catégorie valide dans le champ nouveau texte.'
        );
      }

      await channel.setParent(category.id, {
        lockPermissions: false,
        reason: 'Pouvoir Jax Chaos'
      });
    }

    if (action === 'channel-position') {
      const position = Number(value);

      if (
        !Number.isInteger(position) ||
        position < 0 ||
        position > 500
      ) {
        throw new Error(
          'La position doit être un nombre entier entre 0 et 500.'
        );
      }

      await channel.setPosition(position);
    }
  }

  else if (
    action === 'create-text' ||
    action === 'create-voice' ||
    action === 'create-category'
  ) {
    const name = cleanName(
      glitch(value, String(values.style || 'glitch'))
    );

    const type =
      action === 'create-text'
        ? ChannelType.GuildText
        : action === 'create-voice'
          ? ChannelType.GuildVoice
          : ChannelType.GuildCategory;

    const channel = await guild.channels.create({
      name,
      type,
      reason: 'Pouvoir Jax Chaos'
    });

    const current = state.getState().event;

    state.setEvent({
      createdChannels: [
        ...(current.createdChannels || []),
        channel.id
      ]
    });
  }

  else {
    throw new Error('Action inconnue.');
  }

  log(`🃏 Jax Chaos a utilisé : ${action}.`, 'jax');
}

// --------------------------------------------------
// INSTALLATION DES COMMANDES ET INTERACTIONS
// --------------------------------------------------

function install(client) {
  client.on('interactionCreate', async interaction => {
    try {

      // ----------------------------------------------
      // COMMANDE /evenement2
      // ----------------------------------------------

      if (
        interaction.isChatInputCommand() &&
        interaction.commandName === 'evenement2'
      ) {
        if (
          !interaction.memberPermissions?.has(
            PermissionFlagsBits.ManageGuild
          )
        ) {
          return interaction.reply({
            content: 'Commande réservée à l’administration.',
            flags: EPH
          });
        }

        const start =
          interaction.options.getString('action') === 'start';

        const current = state.getState().event;

        if (start && current.active) {
          return interaction.reply({
            content: 'L’événement est déjà actif.',
            flags: EPH
          });
        }

        if (start && current.snapshot) {
          return interaction.reply({
            content:
              'Une ancienne sauvegarde Jax attend encore la restauration de Ladybug. Lance Miraculous Ladybug avant de redémarrer un événement.',
            flags: EPH
          });
        }

        if (!start && !current.active) {
          return interaction.reply({
            content: 'L’événement est déjà arrêté.',
            flags: EPH
          });
        }

        if (start) {
          state.setEvent({
            active: true,
            startedAt: Date.now(),
            endedAt: null,
            stage: 'accueil',
            fragments: [],
            fragmentsUnlocked: false,
            players: {},
            snapshot: null,
            createdChannels: [],
            changedByJax: []
          });

          characterHolders.clear();
        } else {
          state.setEvent({
            active: false,
            endedAt: Date.now(),
            stage: 'arrêté',
            fragmentsUnlocked: false
          });
        }

        const announcement =
          interaction.options.getChannel('salon');

        const announceText = start
          ? '🎪 **Le crossover Miraculous × The Amazing Digital Circus commence !** Les personnages peuvent rejoindre leurs panneaux. Les fragments du Lucky Charm restent verrouillés jusqu’à l’akumatisation de Jax Chaos.'
          : '🛑 **L’événement est arrêté.** Les systèmes d’akumatisation habituels restent inchangés.';

        if (announcement && announcement.isTextBased()) {
          await announcement.send({
            content: announceText,
            allowedMentions: { parse: [] }
          });
        }

        log(
          start
            ? '🎪 Événement lancé depuis Discord.'
            : '🎪 Événement arrêté depuis Discord.',
          'event'
        );

        return interaction.reply({
          content: start
            ? '🎪 Le crossover commence ! Les fragments sont verrouillés jusqu’à l’arrivée de Jax Chaos.'
            : '🛑 L’événement est arrêté. Les akumatisations normales restent inchangées.',
          flags: EPH
        });
      }

      // ----------------------------------------------
      // COMMANDE /jax
      // ----------------------------------------------

      if (
        interaction.isChatInputCommand() &&
        interaction.commandName === 'jax'
      ) {
        if (!state.getState().event.active) {
          return interaction.reply({
            content:
              'Le panneau Jax est désactivé : l’événement n’est pas actif.',
            flags: EPH
          });
        }

        if (!isJax(interaction.member, interaction.guildId)) {
          return interaction.reply({
            content:
              'Accès refusé : seul le membre akumatisé en Jax Chaos peut ouvrir ce panneau.',
            flags: EPH
          });
        }

        return interaction.reply(jaxPanel(interaction.member));
      }

      // ----------------------------------------------
      // COMMANDES DES PERSONNAGES
      // ----------------------------------------------

      if (
        interaction.isChatInputCommand() &&
        characters[interaction.commandName]
      ) {
        if (!state.getState().event.active) {
          return interaction.reply({
            content:
              'Les panneaux du Digital Circus sont disponibles pendant l’événement.',
            flags: EPH
          });
        }

        if (
          interaction.commandName === 'caine' &&
          !interaction.memberPermissions?.has(
            PermissionFlagsBits.ManageGuild
          )
        ) {
          return interaction.reply({
            content:
              'Le panneau Caine est réservé à l’administration de l’événement.',
            flags: EPH
          });
        }

        const key =
          `${interaction.guildId}:${interaction.commandName}`;

        const holder = characterHolders.get(key);

        if (holder && holder !== interaction.user.id) {
          return interaction.reply({
            content:
              `${characters[interaction.commandName].name} est déjà incarné par <@${holder}>.`,
            flags: EPH
          });
        }

        for (const [heldKey, userId] of characterHolders) {
          if (
            heldKey.startsWith(`${interaction.guildId}:`) &&
            userId === interaction.user.id &&
            heldKey !== key
          ) {
            return interaction.reply({
              content:
                'Tu incarnes déjà un autre personnage du Digital Circus. Libère-le avant d’en choisir un nouveau.',
              flags: EPH
            });
          }
        }

        characterHolders.set(key, interaction.user.id);

        return interaction.reply(
          privatePanel(interaction.commandName)
        );
      }

      // ----------------------------------------------
      // BOUTONS DES PERSONNAGES
      // ----------------------------------------------

      if (
        interaction.isButton() &&
        interaction.customId.startsWith('circus:')
      ) {
        const [, action, key] =
          interaction.customId.split(':');

        if (action === 'progress') {
          const event = state.getState().event;

          return interaction.reply({
            content:
              `🎟️ Fragments débloqués : **${(event.fragments || []).length}/4**\n` +
              (
                event.fragments?.length
                  ? event.fragments.join('\n')
                  : 'Aucun fragment pour le moment.'
              ),
            flags: EPH
          });
        }

        if (action === 'release') {
          const holderKey =
            `${interaction.guildId}:${key}`;

          if (
            characterHolders.get(holderKey) !==
            interaction.user.id
          ) {
            return interaction.reply({
              content: 'Ce personnage ne t’appartient pas.',
              flags: EPH
            });
          }

          characterHolders.delete(holderKey);

          return interaction.update({
            content:
              '🔙 Tu as libéré ce personnage. Un autre membre peut maintenant le choisir.',
            embeds: [],
            components: []
          });
        }

        if (action === 'answer') {
          const character = characters[key];

          if (!character || !character.fragment) {
            return interaction.reply({
              content: 'Cette énigme n’est pas disponible.',
              flags: EPH
            });
          }

          const event = state.getState().event;

          if (
            !event.active ||
            !(
              event.fragmentsUnlocked === true ||
              event.stage === 'chaos'
            )
          ) {
            return interaction.reply({
              content:
                '🔒 Les fragments sont encore verrouillés. Attends que Jax Chaos soit akumatisé.',
              flags: EPH
            });
          }

          const modal = new ModalBuilder()
            .setCustomId(`circus:submit:${key}`)
            .setTitle(`Énigme de ${character.name}`);

          const input = new TextInputBuilder()
            .setCustomId('answer')
            .setLabel(character.question.slice(0, 45))
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

          modal.addComponents(
            new ActionRowBuilder().addComponents(input)
          );

          return interaction.showModal(modal);
        }
      }

      // ----------------------------------------------
      // RÉPONSES AUX ÉNIGMES
      // ----------------------------------------------

      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith('circus:submit:')
      ) {
        const key =
          interaction.customId.split(':')[2];

        const character = characters[key];

        if (!character || !character.fragment) {
          return interaction.reply({
            content: 'Cette énigme n’est pas disponible.',
            flags: EPH
          });
        }

        const event = state.getState().event;

        if (
          !event.active ||
          !(
            event.fragmentsUnlocked === true ||
            event.stage === 'chaos'
          )
        ) {
          return interaction.reply({
            content:
              '🔒 Les fragments sont encore verrouillés. Jax doit d’abord être akumatisé.',
            flags: EPH
          });
        }

        const answer = interaction.fields
          .getTextInputValue('answer')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim();

        const validAnswers = character.answer.map(value =>
          value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
        );

        if (!validAnswers.includes(answer)) {
          return interaction.reply({
            content:
              '❌ Ce n’est pas la bonne réponse. Relis les indices et réessaie !',
            flags: EPH
          });
        }

        const result = state.addFragment(
          interaction.guildId,
          interaction.user.id,
          character.name,
          character.fragment
        );

        if (!result.ok) {
          return interaction.reply({
            content: `ℹ️ ${result.reason}`,
            flags: EPH
          });
        }

        return interaction.reply({
          content:
            `🎉 Bonne réponse ! **${character.name}** vient de débloquer **${character.fragment}**.\n` +
            `Progression collective : **${result.count}/4** fragments.`,
          flags: EPH
        });
      }

      // ----------------------------------------------
      // MENU DES POUVOIRS DE JAX
      // ----------------------------------------------

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId === 'jax:action'
      ) {
        if (
          !state.getState().event.active ||
          !isJax(interaction.member, interaction.guildId)
        ) {
          return interaction.reply({
            content: 'Accès refusé.',
            flags: EPH
          });
        }

        const action = interaction.values[0];

        const modal = new ModalBuilder()
          .setCustomId(`jax:submit:${action}`)
          .setTitle('Pouvoir de Jax Chaos');

        const value = new TextInputBuilder()
          .setCustomId('value')
          .setLabel(
            action.startsWith('guild-')
              ? 'Nouveau texte'
              : 'Nouveau nom / sujet'
          )
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(
            ![
              'lock-channel',
              'unlock-channel',
              'clone-channel',
              'delete-channel'
            ].includes(action)
          )
          .setMaxLength(1000);

        const channel = new TextInputBuilder()
          .setCustomId('channelId')
          .setLabel('ID du salon (si nécessaire)')
          .setStyle(TextInputStyle.Short)
          .setRequired([
            'channel-name',
            'channel-topic',
            'lock-channel',
            'unlock-channel',
            'clone-channel',
            'delete-channel',
            'move-channel',
            'channel-position'
          ].includes(action))
          .setMaxLength(25);

        const style = new TextInputBuilder()
          .setCustomId('style')
          .setLabel('Style : glitch, corruption, circus, error, chaos')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(20);

        modal.addComponents(
          new ActionRowBuilder().addComponents(value),
          new ActionRowBuilder().addComponents(channel),
          new ActionRowBuilder().addComponents(style)
        );

        return interaction.showModal(modal);
      }

      // ----------------------------------------------
      // VALIDATION DES ACTIONS DE JAX
      // ----------------------------------------------

      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith('jax:submit:')
      ) {
        if (
          !state.getState().event.active ||
          !isJax(interaction.member, interaction.guildId)
        ) {
          return interaction.reply({
            content: 'Accès refusé.',
            flags: EPH
          });
        }

        const action =
          interaction.customId.split(':')[2];

        const value =
          interaction.fields.getTextInputValue('value');

        const channelId =
          interaction.fields.getTextInputValue('channelId');

        const style =
          interaction.fields.getTextInputValue('style');

        // Suppression : confirmation obligatoire.
        if (action === 'delete-channel') {
          const channel = await interaction.guild.channels
            .fetch(channelId)
            .catch(() => null);

          if (
            !channel ||
            protectedName.test(channel.name)
          ) {
            return interaction.reply({
              content: '❌ Salon introuvable ou protégé.',
              flags: EPH
            });
          }

          const snapshot =
            state.getState().event.snapshot;

          const known =
            (snapshot?.channels || []).some(
              item => item.id === channel.id
            ) ||
            (
              state.getState().event.createdChannels || []
            ).includes(channel.id);

          if (!known) {
            return interaction.reply({
              content:
                '❌ Ce salon ne figure pas dans la sauvegarde. Suppression refusée.',
              flags: EPH
            });
          }

          const confirm = new ButtonBuilder()
            .setCustomId(
              `jax:delete-confirm:${channel.id}:${interaction.user.id}`
            )
            .setLabel(
              `Confirmer la suppression de #${channel.name}`.slice(0, 80)
            )
            .setStyle(ButtonStyle.Danger);

          return interaction.reply({
            content:
              `⚠️ Tu vas supprimer **#${channel.name}**. Ladybug pourra le recréer depuis la sauvegarde, mais son identifiant Discord changera.`,
            components: [
              new ActionRowBuilder().addComponents(confirm)
            ],
            flags: EPH
          });
        }

        await interaction.deferReply({
          flags: EPH
        });

        await executeJax(
          interaction,
          action,
          {
            value,
            channelId,
            style
          }
        );

        return interaction.editReply(
          '🃏 Pouvoir appliqué. Le changement est enregistré pour le Lucky Charm de Ladybug.'
        );
      }

      // ----------------------------------------------
      // CONFIRMATION DE SUPPRESSION
      // ----------------------------------------------

      if (
        interaction.isButton() &&
        interaction.customId.startsWith('jax:delete-confirm:')
      ) {
        const [
          ,
          ,
          channelId,
          ownerId
        ] = interaction.customId.split(':');

        if (
          ownerId !== interaction.user.id ||
          !isJax(interaction.member, interaction.guildId) ||
          !state.getState().event.active
        ) {
          return interaction.reply({
            content: 'Confirmation refusée.',
            flags: EPH
          });
        }

        const channel = await interaction.guild.channels
          .fetch(channelId)
          .catch(() => null);

        if (
          !channel ||
          protectedName.test(channel.name)
        ) {
          return interaction.update({
            content:
              'Salon introuvable ou protégé. Aucune suppression effectuée.',
            components: []
          });
        }

        await channel.delete(
          'Pouvoir Jax Chaos — confirmation du joueur'
        );

        log(
          `🗑️ Jax Chaos a supprimé le salon ${channelId} (restaurable par Ladybug).`,
          'jax'
        );

        return interaction.update({
          content:
            '🗑️ Salon supprimé. La sauvegarde permettra à Ladybug de le recréer.',
          components: []
        });
      }

    } catch (error) {
      console.error('[jax-chaos]', error);

      const message =
        `⚠️ ${error.message || 'Une erreur est survenue.'}`;

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: message,
          flags: EPH
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: message,
          flags: EPH
        }).catch(() => {});
      }
    }
  });
}

// --------------------------------------------------
// EXPORTS
// --------------------------------------------------

module.exports = {
  commandsData,
  install,
  restoreServer,
  characters
};
