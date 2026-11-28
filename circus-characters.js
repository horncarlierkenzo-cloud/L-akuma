'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const CHARACTERS = {
  caine: {
    name: 'Caine',
    title: '🎩 Maître du Digital Circus',
    color: 0xf0b323,
    description: 'Bienvenue dans le Digital Circus ! Le spectacle va bientôt commencer. Préparez-vous à vivre une aventure extraordinaire !',
    image: process.env.CIRCUS_CAINE_IMAGE_URL,
    owner: process.env.CAINE_USER_ID,
    actions: [
      ['welcome', '🎪 Accueillir les membres'],
      ['activity', '🎲 Lancer une activité'],
      ['show', '✨ Annoncer le spectacle'],
    ],
  },

  pomni: {
    name: 'Pomni',
    title: '🤡 Exploratrice du cirque',
    color: 0xe94b5b,
    description: 'Tout semble étrange ici… Où sommes-nous ? Il faut trouver un moyen de comprendre ce monde !',
    image: process.env.CIRCUS_POMNI_IMAGE_URL,
    owner: process.env.POMNI_USER_ID,
    actions: [
      ['explore', '🔎 Lancer une exploration'],
      ['alert', '⚠️ Alerter les membres'],
      ['question', '❔ Poser une question'],
    ],
  },

  ragatha: {
    name: 'Ragatha',
    title: '🧵 Le cœur du cirque',
    color: 0xe982a5,
    description: 'Pas de panique ! Nous allons essayer de nous entraider et de garder le sourire.',
    image: process.env.CIRCUS_RAGATHA_IMAGE_URL,
    owner: process.env.RAGATHA_USER_ID,
    actions: [
      ['welcome', '💗 Encourager les membres'],
      ['help', '🧵 Proposer son aide'],
      ['activity', '🌸 Organiser une activité'],
    ],
  },

  jax: {
    name: 'Jax',
    title: '🐰 Le provocateur du cirque',
    color: 0x9b59b6,
    description: 'Alors, vous vous amusez bien ? J’espère que vous êtes prêts pour quelques surprises…',
    image: process.env.CIRCUS_JAX_IMAGE_URL,
    owner: process.env.JAX_USER_ID,
    actions: [
      ['tease', '😈 Provoquer les membres'],
      ['prank', '🎭 Préparer une farce'],
      ['announce', '📢 Faire une annonce'],
    ],
  },

  zooble: {
    name: 'Zooble',
    title: '🧩 L’esprit indépendant',
    color: 0xd66ad6,
    description: 'Je ne sais toujours pas ce que je fais ici… Mais bon, autant voir ce qui va se passer.',
    image: process.env.CIRCUS_ZOOBLE_IMAGE_URL,
    owner: process.env.ZOOBLE_USER_ID,
    actions: [
      ['reaction', '🧩 Réagir au cirque'],
      ['question', '💬 Donner son avis'],
      ['announce', '📢 Faire une annonce'],
    ],
  },

  gangle: {
    name: 'Gangle',
    title: '🎭 L’artiste aux masques',
    color: 0x56b9d8,
    description: 'J’espère que cette journée se passera bien… J’ai préparé quelques petites activités.',
    image: process.env.CIRCUS_GANGLE_IMAGE_URL,
    owner: process.env.GANGLE_USER_ID,
    actions: [
      ['art', '🎨 Présenter une activité artistique'],
      ['mood', '🎭 Partager son humeur'],
      ['activity', '🎀 Proposer une activité'],
    ],
  },

  kinger: {
    name: 'Kinger',
    title: '♟️ Le roi du cirque',
    color: 0x9b8de5,
    description: 'Une nouvelle aventure ? Dans ce cas, restons vigilants… On ne sait jamais ce qui nous attend !',
    image: process.env.CIRCUS_KINGER_IMAGE_URL,
    owner: process.env.KINGER_USER_ID,
    actions: [
      ['alert', '♟️ Lancer une alerte'],
      ['story', '📖 Raconter une histoire'],
      ['announce', '📢 Faire une annonce'],
    ],
  },
};

const PUBLIC_MESSAGES = {
  caine: {
    welcome: '🎩 **Caine :** Bienvenue, chers membres, dans le merveilleux Digital Circus ! Le spectacle peut commencer !',
    activity: '🎲 **Caine :** Que le jeu commence ! Tout le monde est invité à participer à la prochaine activité !',
    show: '✨ **Caine :** Mesdames et messieurs, veuillez prendre place ! Un nouveau spectacle va commencer !',
  },
  pomni: {
    explore: '🤡 **Pomni :** Je vais essayer d’explorer cet endroit… Quelqu’un veut venir avec moi ?',
    alert: '⚠️ **Pomni :** Attendez ! J’ai l’impression que quelque chose ne tourne pas rond ici !',
    question: '❔ **Pomni :** Est-ce que quelqu’un comprend vraiment ce qui se passe dans ce cirque ?',
  },
  ragatha: {
    welcome: '🧵 **Ragatha :** N’hésitez pas à venir discuter ! Nous sommes tous dans cette aventure ensemble.',
    help: '💗 **Ragatha :** Si quelqu’un a besoin d’aide, je suis là !',
    activity: '🌸 **Ragatha :** Et si nous faisions une petite activité tous ensemble ?',
  },
  jax: {
    tease: '🐰 **Jax :** Alors, la troupe ? Vous avez déjà peur ? On ne fait que commencer !',
    prank: '🎭 **Jax :** J’ai une petite surprise pour vous… Enfin, j’espère que vous aimez les surprises.',
    announce: '😈 **Jax :** Attention, tout le monde ! J’ai quelque chose à vous annoncer.',
  },
  zooble: {
    reaction: '🧩 **Zooble :** Bon… Je dois reconnaître que cette aventure est plutôt bizarre.',
    question: '💬 **Zooble :** Quelqu’un peut m’expliquer pourquoi tout le monde trouve cet endroit normal ?',
    announce: '🧩 **Zooble :** Hé, écoutez un peu ! J’ai quelque chose à dire.',
  },
  gangle: {
    art: '🎨 **Gangle :** J’ai préparé une petite activité artistique. Qui veut participer ?',
    mood: '🎭 **Gangle :** Aujourd’hui, je partage un petit moment avec vous. Comment allez-vous ?',
    activity: '🎀 **Gangle :** Et si nous faisions une activité créative ensemble ?',
  },
  kinger: {
    alert: '♟️ **Kinger :** Attention ! Restons groupés et gardons notre calme.',
    story: '📖 **Kinger :** Approchez… J’ai une histoire à vous raconter.',
    announce: '♟️ **Kinger :** Membres du cirque, j’ai une annonce importante à faire.',
  },
};

function buildCommand(character) {
  return new SlashCommandBuilder()
    .setName(character)
    .setDescription(`Ouvre le panneau privé de ${CHARACTERS[character].name}`)
    .setDMPermission(false);
}

const commandsData = Object.keys(CHARACTERS).map(buildCommand);

function buildPanel(character) {
  const data = CHARACTERS[character];

  const embed = new EmbedBuilder()
    .setColor(data.color)
    .setTitle(data.title)
    .setDescription(data.description)
    .addFields({
      name: '🎪 Panneau de personnage',
      value: `Personnage : **${data.name}**\nAccès : **privé**\nChoisis une action ci-dessous.`,
    })
    .setFooter({ text: 'Digital Circus · Panneau personnel' })
    .setTimestamp();

  if (data.image && /^https:\/\/\S+/i.test(data.image)) {
    embed.setImage(data.image);
  }

  const buttons = data.actions.map(([action, label]) =>
    new ButtonBuilder()
      .setCustomId(`circus:${character}:${action}`)
      .setLabel(label)
      .setStyle(
        action === 'alert' || action === 'tease'
          ? ButtonStyle.Danger
          : ButtonStyle.Primary
      )
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += 3) {
    rows.push(
      new ActionRowBuilder().addComponents(buttons.slice(i, i + 3))
    );
  }

  return { embeds: [embed], components: rows };
}

async function handleInteraction(interaction) {
  if (interaction.isChatInputCommand()) {
    const character = interaction.commandName;
    const data = CHARACTERS[character];

    if (!data) return false;

    if (!data.owner) {
      return interaction.reply({
        content: `🔒 Le responsable de ${data.name} n’a pas encore été configuré. L’administrateur doit définir la variable ${character.toUpperCase()}_USER_ID sur Render.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.user.id !== data.owner) {
      return interaction.reply({
        content: `🔒 Ce panneau est réservé à la personne qui incarne ${data.name}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      ...buildPanel(character),
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!interaction.isButton()) return false;

  const parts = interaction.customId.split(':');
  if (parts.length !== 3 || parts[0] !== 'circus') return false;

  const [, character, action] = parts;
  const data = CHARACTERS[character];

  if (!data || !PUBLIC_MESSAGES[character]?.[action]) return false;

  if (!data.owner || interaction.user.id !== data.owner) {
    return interaction.reply({
      content: '🔒 Tu ne peux pas utiliser le panneau de ce personnage.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!interaction.channel || !interaction.channel.isTextBased()) {
    return interaction.reply({
      content: 'Impossible de publier dans ce salon.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply({
    content: '✅ Ton action a été publiée dans le salon.',
    flags: MessageFlags.Ephemeral,
  });

  await interaction.channel.send({
    content: PUBLIC_MESSAGES[character][action],
    allowedMentions: { parse: [] },
  });

  return true;
}

module.exports = {
  commandsData,
  handleInteraction,
  CHARACTERS,
};
