
'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

// ==================================================
// PERSONNAGES DU DIGITAL CIRCUS
// ==================================================

const CHARACTERS = {
  caine: {
    name: 'Caine',
    emoji: '🎩',
    color: 0xe9a52d,
    description: 'Le maître de cérémonie du cirque numérique.',
    welcome:
      '🎪 Bienvenue dans le Digital Circus ! Je suis Caine, votre formidable maître de cérémonie ! Préparez-vous pour une aventure incroyable !',
    actions: {
      parler: '🎩 Caine : Mes chers participants, le spectacle va commencer !',
      annoncer: '🎪 Caine : Une nouvelle aventure vous attend ! Que le spectacle commence !',
    },
  },

  pomni: {
    name: 'Pomni',
    emoji: '🤡',
    color: 0xd94b4b,
    description: 'La nouvelle participante du cirque.',
    welcome:
      '😰 Euh… Salut. Je suis Pomni. Est-ce que quelqu’un peut m’expliquer où je suis ?',
    actions: {
      parler: '🤡 Pomni : Je voudrais vraiment trouver une sortie…',
      reagir: '😵 Pomni : Attendez… Qu’est-ce qui se passe encore ?!',
    },
  },

  ragatha: {
    name: 'Ragatha',
    emoji: '🧵',
    color: 0xd875a5,
    description: 'La participante toujours prête à aider.',
    welcome:
      '🧵 Coucou ! Moi, c’est Ragatha. Ne t’inquiète pas, on va essayer de passer une bonne journée ensemble !',
    actions: {
      parler: '🌸 Ragatha : Tout va bien se passer. On va s’entraider !',
      encourager: '💗 Ragatha : Courage ! Tu n’es pas tout seul ici.',
    },
  },

  jax: {
    name: 'Jax',
    emoji: '🐰',
    color: 0x9b59b6,
    description: 'Le lapin provocateur du cirque numérique.',
    welcome:
      '🐰 Oh, salut. Encore un nouveau venu ? Ça promet d’être amusant… surtout pour moi.',
    actions: {
      taquiner: '😈 Jax : Alors, tu comptes rester planté là toute la journée ?',
      blague: '🐰 Jax : J’ai une blague… mais je préfère te laisser découvrir la chute.',
      chaos: '🌀 Jax Chaos : Le chaos commence… Le cirque ne sera plus jamais pareil !',
    },
  },

  zooble: {
    name: 'Zooble',
    emoji: '🧩',
    color: 0x42a89a,
    description: 'La participante qui n’a pas sa langue dans sa poche.',
    welcome:
      '🧩 Salut. C’est Zooble. Je préfère prévenir : je ne suis pas vraiment d’humeur aujourd’hui.',
    actions: {
      parler: '🧩 Zooble : Est-ce qu’on peut faire quelque chose de normal, pour une fois ?',
      protester: '🙄 Zooble : Génial… Encore une aventure complètement absurde.',
    },
  },

  gangle: {
    name: 'Gangle',
    emoji: '🎭',
    color: 0xe58aaf,
    description: 'La participante aux masques de théâtre.',
    welcome:
      '🎭 Bonjour… Je suis Gangle. J’espère que nous allons bien nous entendre.',
    actions: {
      parler: '🎭 Gangle : J’espère que personne ne va se fâcher aujourd’hui…',
      encourager: '💖 Gangle : Je vais essayer de garder le sourire !',
    },
  },

  kinger: {
    name: 'Kinger',
    emoji: '♟️',
    color: 0x8c79dc,
    description: 'Le roi des échecs du cirque numérique.',
    welcome:
      '♟️ AAAAAH ! Oh… Bonjour. Je suis Kinger. Est-ce que quelqu’un a vu mes insectes ?',
    actions: {
      parler: '♟️ Kinger : Les insectes… Ils savent quelque chose que nous ignorons !',
      paniquer: '😱 Kinger : QUI A ÉTEINT LA LUMIÈRE ?!',
    },
  },
};

// ==================================================
// COMMANDES SLASH
// ==================================================

const commandsData = Object.values(CHARACTERS).map((character) => {
  const key = Object.keys(CHARACTERS).find(
    (id) => CHARACTERS[id] === character
  );

  return new SlashCommandBuilder()
    .setName(key)
    .setDescription(character.description)
    .setDMPermission(false);
});

// ==================================================
// PANNEAU PRIVÉ
// ==================================================

function makeEmbed(character, message) {
  return new EmbedBuilder()
    .setColor(character.color)
    .setTitle(`${character.emoji} ${character.name}`)
    .setDescription(message)
    .setFooter({
      text: 'Digital Circus × Miraculous',
    })
    .setTimestamp();
}

function makeButtons(key, userId) {
  const character = CHARACTERS[key];

  const row = new ActionRowBuilder();

  for (const [action, label] of Object.entries(
    character.actions
  )) {
    const names = {
      parler: 'Parler',
      annoncer: 'Annoncer',
      reagir: 'Réagir',
      encourager: 'Encourager',
      taquiner: 'Taquiner',
      blague: 'Faire une blague',
      chaos: 'Déclencher le chaos',
      protester: 'Protester',
      paniquer: 'Paniquer',
    };

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`circus:${key}:${action}:${userId}`)
        .setLabel(names[action] || action)
        .setStyle(
          action === 'chaos'
            ? ButtonStyle.Danger
            : ButtonStyle.Secondary
        )
    );
  }

  return [row];
}

// ==================================================
// OUVERTURE D'UN PANNEAU
// ==================================================

async function openCharacterPanel(interaction, key) {
  const character = CHARACTERS[key];

  if (!character) return false;

  await interaction.reply({
    embeds: [
      makeEmbed(character, character.welcome),
    ],
    components: makeButtons(key, interaction.user.id),
    flags: MessageFlags.Ephemeral,
  });

  return true;
}

// ==================================================
// GESTION DES INTERACTIONS
// ==================================================

async function handleInteraction(interaction) {
  // Commandes slash des personnages.
  if (interaction.isChatInputCommand()) {
    const key = interaction.commandName;

    if (!CHARACTERS[key]) return false;

    try {
      await openCharacterPanel(interaction, key);
    } catch (error) {
      console.error(`[Digital Circus: ${key}]`, error);

      const response = {
        content: '❌ Impossible d’ouvrir le panneau du personnage.',
        flags: MessageFlags.Ephemeral,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response).catch(() => {});
      } else {
        await interaction.reply(response).catch(() => {});
      }
    }

    return true;
  }

  // Boutons des panneaux.
  if (!interaction.isButton()) return false;

  if (!interaction.customId.startsWith('circus:')) {
    return false;
  }

  const [, key, action, ownerId] =
    interaction.customId.split(':');

  const character = CHARACTERS[key];

  if (!character || !character.actions[action]) {
    return false;
  }

  // Seul le créateur du panneau peut utiliser ses boutons.
  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: '🔒 Ce panneau appartient à une autre personne.',
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});

    return true;
  }

  // Jax Chaos : nécessite le rôle Akumatisé.
  if (key === 'jax' && action === 'chaos') {
    const member = await interaction.guild.members
      .fetch(interaction.user.id)
      .catch(() => null);

    const roleName = process.env.AKUMA_ROLE || 'Akumatisé';

    const isAkumatized = member?.roles.cache.some(
      (role) => role.name === roleName
    );

    if (!isAkumatized) {
      await interaction.reply({
        content:
          '🦋 Tu dois d’abord être akumatisé par Papillon Ombre depuis le panneau du site pour déclencher Jax Chaos.',
        flags: MessageFlags.Ephemeral,
      });

      return true;
    }
  }

  const message = character.actions[action];

  try {
    await interaction.update({
      embeds: [
        makeEmbed(character, message),
      ],
      components: makeButtons(key, ownerId),
    });
  } catch (error) {
    console.error(
      `[Digital Circus: bouton ${key}/${action}]`,
      error
    );

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ Cette action n’a pas pu être exécutée.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }

  return true;
}

// ==================================================
// EXPORTS
// ==================================================

module.exports = {
  CHARACTERS,
  commandsData,
  handleInteraction,
};
