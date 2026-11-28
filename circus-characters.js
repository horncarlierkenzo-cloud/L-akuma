
'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');

const CHARACTERS = {
  caine: {
    name: 'Caine',
    color: 0xff3333,
    description: 'Le maître de cérémonie du Cirque Numérique !',
    image: process.env.CIRCUS_CAINE_IMAGE_URL,
    actions: [
      { id: 'welcome', label: 'Accueillir', emoji: '🎪' },
      { id: 'announce', label: 'Annoncer', emoji: '📢' },
      { id: 'adventure', label: 'Lancer une aventure', emoji: '🎭' }
    ]
  },

  pomni: {
    name: 'Pomni',
    color: 0xff5555,
    description: 'Une nouvelle venue qui cherche à comprendre ce monde.',
    image: process.env.CIRCUS_POMNI_IMAGE_URL,
    actions: [
      { id: 'talk', label: 'Parler', emoji: '💬' },
      { id: 'fear', label: 'Exprimer ses doutes', emoji: '😰' },
      { id: 'explore', label: 'Explorer', emoji: '🔎' }
    ]
  },

  ragatha: {
    name: 'Ragatha',
    color: 0xe88aa8,
    description: 'Toujours prête à aider les autres.',
    image: process.env.CIRCUS_RAGATHA_IMAGE_URL,
    actions: [
      { id: 'talk', label: 'Parler', emoji: '💬' },
      { id: 'comfort', label: 'Réconforter', emoji: '❤️' },
      { id: 'help', label: 'Aider', emoji: '🧵' }
    ]
  },

  jax: {
    name: 'Jax',
    color: 0x9b59b6,
    description: 'Le lapin violet qui adore provoquer le chaos.',
    image: process.env.CIRCUS_JAX_IMAGE_URL,
    actions: [
      { id: 'tease', label: 'Provoquer', emoji: '😈' },
      { id: 'joke', label: 'Faire une blague', emoji: '🤣' },
      { id: 'chaos', label: 'Déclencher le chaos', emoji: '💥' }
    ]
  },

  zooble: {
    name: 'Zooble',
    color: 0xf39c12,
    description: 'Un personnage qui n'a pas toujours envie de participer.',
    image: process.env.CIRCUS_ZOOBLE_IMAGE_URL,
    actions: [
      { id: 'talk', label: 'Parler', emoji: '💬' },
      { id: 'complain', label: 'Râler', emoji: '🙄' },
      { id: 'join', label: 'Participer', emoji: '🎭' }
    ]
  },

  gangle: {
    name: 'Gangle',
    color: 0xe74c3c,
    description: 'Un personnage sensible avec ses masques.',
    image: process.env.CIRCUS_GANGLE_IMAGE_URL,
    actions: [
      { id: 'talk', label: 'Parler', emoji: '💬' },
      { id: 'happy', label: 'Montrer sa joie', emoji: '😊' },
      { id: 'sad', label: 'Exprimer sa tristesse', emoji: '🎭' }
    ]
  },

  kinger: {
    name: 'Kinger',
    color: 0x8e44ad,
    description: 'Le roi des échecs du Cirque Numérique.',
    image: process.env.CIRCUS_KINGER_IMAGE_URL,
    actions: [
      { id: 'talk', label: 'Parler', emoji: '💬' },
      { id: 'think', label: 'Réfléchir', emoji: '♟️' },
      { id: 'panic', label: 'Paniquer', emoji: '😵' }
    ]
  }
};

const RESPONSES = {
  caine: {
    welcome: '🎪 Bienvenue dans le merveilleux Cirque Numérique !',
    announce: '📢 Attention, chers artistes ! Caine a une annonce à faire !',
    adventure: '🎭 Que le spectacle commence ! Une nouvelle aventure vous attend !'
  },
  pomni: {
    talk: '💬 Pomni regarde autour d’elle : « Est-ce que quelqu’un peut m’expliquer où je suis ? »',
    fear: '😰 Pomni semble inquiète. « Je veux vraiment trouver une sortie... »',
    explore: '🔎 Pomni décide de regarder les alentours.'
  },
  ragatha: {
    talk: '💬 Ragatha : « Salut ! J’espère que tu vas bien ! »',
    comfort: '❤️ Ragatha essaie de rassurer tout le monde.',
    help: '🧵 Ragatha propose son aide.'
  },
  jax: {
    tease: '😈 Jax affiche un grand sourire : « Alors, on s’amuse ? »',
    joke: '🤣 Jax vient de faire une nouvelle plaisanterie.',
    chaos: '💥 Jax prépare encore une mauvaise surprise...'
  },
  zooble: {
    talk: '💬 Zooble : « Qu’est-ce que tu me veux ? »',
    complain: '🙄 Zooble n’a vraiment pas l’air impressionné.',
    join: '🎭 Zooble accepte finalement de participer.'
  },
  gangle: {
    talk: '💬 Gangle : « Oh... Bonjour... »',
    happy: '😊 Gangle semble retrouver un peu de joie.',
    sad: '🎭 Gangle baisse doucement la tête.'
  },
  kinger: {
    talk: '💬 Kinger : « Est-ce que nous sommes dans une partie d’échecs ? »',
    think: '♟️ Kinger réfléchit profondément.',
    panic: '😵 Kinger semble complètement perdu !'
  }
};

const commandsData = Object.keys(CHARACTERS).map(key =>
  new SlashCommandBuilder()
    .setName(key)
    .setDescription(`Ouvrir le panneau privé de ${CHARACTERS[key].name}`)
    .toJSON()
);

function buildPanel(key) {
  const character = CHARACTERS[key];

  const embed = new EmbedBuilder()
    .setColor(character.color)
    .setTitle(`🎪 Panneau de ${character.name}`)
    .setDescription(
      `${character.description}\n\n` +
      'Choisis une action ci-dessous pour faire intervenir ce personnage.'
    )
    .setFooter({ text: 'Cirque Numérique • Panneau de personnage' });

  if (
    character.image &&
    /^https:\/\//i.test(character.image)
  ) {
    embed.setImage(character.image);
  }

  const rows = [];

  for (let i = 0; i < character.actions.length; i += 3) {
    const buttons = character.actions
      .slice(i, i + 3)
      .map(action =>
        new ButtonBuilder()
          .setCustomId(`circus:${key}:${action.id}`)
          .setLabel(action.label)
          .setEmoji(action.emoji)
          .setStyle(ButtonStyle.Primary)
      );

    rows.push(new ActionRowBuilder().addComponents(buttons));
  }

  return { embeds: [embed], components: rows };
}

async function handleInteraction(interaction) {
  if (interaction.isChatInputCommand()) {
    const key = interaction.commandName;

    if (!CHARACTERS[key]) {
      return false;
    }

    await interaction.reply({
      ...buildPanel(key),
      flags: MessageFlags.Ephemeral
    });

    return true;
  }

  if (!interaction.isButton()) {
    return false;
  }

  const parts = interaction.customId.split(':');

  if (parts[0] !== 'circus') {
    return false;
  }

  const key = parts[1];
  const action = parts[2];

  if (!CHARACTERS[key] || !RESPONSES[key]?.[action]) {
    return false;
  }

  const character = CHARACTERS[key];
  const response = RESPONSES[key][action];

  await interaction.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(character.color)
        .setAuthor({ name: character.name })
        .setDescription(response)
    ]
  });

  await interaction.reply({
    content: `✅ ${character.name} est intervenu dans le salon !`,
    flags: MessageFlags.Ephemeral
  });

  return true;
}

module.exports = {
  commandsData,
  handleInteraction,
  CHARACTERS
};
