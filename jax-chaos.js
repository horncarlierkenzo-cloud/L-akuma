
'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const siteState = require('./site-state');

const ROLE_AKUMA = process.env.AKUMA_ROLE || 'Akumatisé';
const ROLE_CHAOS = process.env.JAX_CHAOS_ROLE || 'Jax Chaos';

const PREFIX = 'jaxchaos:';

const sessions = new Map();

const CHARACTER_MESSAGES = {
  caine: '🎩 Caine : JAX ! Tu es en train de transformer mon magnifique cirque en catastrophe !',
  pomni: '🤡 Pomni : Pourquoi est-ce que tout devient encore plus bizarre ?!',
  ragatha: '🧵 Ragatha : Jax, arrête ! Ce n’est vraiment pas drôle !',
  zooble: '🧩 Zooble : Je savais que cette journée allait être pénible.',
  gangle: '🎭 Gangle : Oh non… J’espère que tout va s’arranger.',
  kinger: '♟️ Kinger : LE CHAOS ! LES PORTES ! LES INSECTES !',
};

function getSession(guildId) {
  return sessions.get(guildId) || null;
}

function createEmbed(title, description, color = 0x9b59b6) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text: 'Papillon Ombre · Jax Chaos',
    })
    .setTimestamp();
}

function createPanel(ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}provocation:${ownerId}`)
      .setLabel('Provoquer')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`${PREFIX}personnage:${ownerId}`)
      .setLabel('Interagir avec le cirque')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`${PREFIX}statut:${ownerId}`)
      .setLabel('Voir le chaos')
      .setStyle(ButtonStyle.Danger)
  );
}

async function ensureRole(guild, member) {
  let role = guild.roles.cache.find(
    (r) => r.name === ROLE_CHAOS
  );

  if (!role) {
    role = await guild.roles.create({
      name: ROLE_CHAOS,
      color: 0x9b59b6,
      reason: 'État Jax Chaos',
    });
  }

  if (!member.roles.cache.has(role.id)) {
    await member.roles.add(role);
  }

  return role;
}

// Appelé par le serveur lorsque Papillon Ombre akumatise Jax.
async function activateJax(guild, member, entry = {}) {
  if (!guild || !member) {
    throw new Error('Serveur ou membre manquant pour Jax Chaos.');
  }

  const existing = getSession(guild.id);

  if (existing?.active && existing.userId !== member.id) {
    throw new Error('Une session Jax Chaos est déjà active.');
  }

  await ensureRole(guild, member);

  const session = {
    active: true,
    guildId: guild.id,
    userId: member.id,
    startedAt: Date.now(),
    stage: 'chaos',
    actions: 0,
    characters: [],
    entry,
  };

  sessions.set(guild.id, session);

  return session;
}

// Ouvre le panneau personnel de Jax.
async function openJaxPanel(interaction) {
  const session = getSession(interaction.guildId);

  if (!session?.active || session.userId !== interaction.user.id) {
    await interaction.reply({
      content: '🐰 Tu n’as pas encore été choisi pour Jax Chaos.',
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  await interaction.reply({
    embeds: [
      createEmbed(
        '🐰 JAX CHAOS',
        [
          'Le chaos s’est emparé du cirque numérique.',
          '',
          'Tu peux maintenant provoquer les participants, interagir avec eux et consulter l’état du chaos.',
          '',
          '🌀 Le spectacle ne fait que commencer…',
        ].join('\n')
      ),
    ],
    components: [createPanel(interaction.user.id)],
    flags: MessageFlags.Ephemeral,
  });

  return true;
}

// Restaure les rôles et termine la session.
async function restoreServer(guild) {
  const session = getSession(guild.id);

  const role = guild.roles.cache.find(
    (r) => r.name === ROLE_CHAOS
  );

  if (role) {
    const member = await guild.members
      .fetch(session?.userId || '')
      .catch(() => null);

    if (member) {
      await member.roles.remove(role).catch(() => {});
    }
  }

  if (session) {
    session.active = false;
    session.stage = 'purifié';
    session.finishedAt = Date.now();
  }

  sessions.delete(guild.id);

  return true;
}

// Boutons du panneau Jax.
async function handleButton(interaction) {
  if (!interaction.isButton()) return false;

  if (!interaction.customId.startsWith(PREFIX)) {
    return false;
  }

  const [, action, ownerId] = interaction.customId.split(':');

  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: '🔒 Ce panneau appartient à Jax.',
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  const session = getSession(interaction.guildId);

  if (!session?.active || session.userId !== interaction.user.id) {
    await interaction.reply({
      content: '🦋 Le chaos de Jax est terminé ou a été purifié.',
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  session.actions += 1;

  if (action === 'provocation') {
    await interaction.reply({
      content:
        '😈 Jax : Alors, vous pensiez vraiment que j’allais vous laisser tranquilles ?',
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  if (action === 'personnage') {
    const choices = Object.keys(CHARACTER_MESSAGES);

    const row = new ActionRowBuilder();

    for (const key of choices) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`${PREFIX}cible:${key}:${ownerId}`)
          .setLabel(key.charAt(0).toUpperCase() + key.slice(1))
          .setStyle(ButtonStyle.Secondary)
      );
    }

    await interaction.reply({
      content: '🎪 Choisis le personnage avec lequel Jax veut interagir :',
      components: [row],
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  if (action === 'statut') {
    await interaction.reply({
      embeds: [
        createEmbed(
          '🌀 État du chaos',
          [
            `**Statut :** ${session.active ? 'Actif' : 'Terminé'}`,
            `**Étape :** ${session.stage}`,
            `**Actions effectuées :** ${session.actions}`,
            `**Personnages rencontrés :** ${
              session.characters.length
                ? session.characters.join(', ')
                : 'Aucun'
            }`,
          ].join('\n')
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  if (action === 'cible') {
    const [, , character, targetOwner] =
      interaction.customId.split(':');

    if (targetOwner !== interaction.user.id) {
      await interaction.reply({
        content: '🔒 Action réservée à Jax.',
        flags: MessageFlags.Ephemeral,
      });

      return true;
    }

    const message = CHARACTER_MESSAGES[character];

    if (!message) return true;

    if (!session.characters.includes(character)) {
      session.characters.push(character);
    }

    await interaction.update({
      content: message,
      components: [],
    });

    return true;
  }

  return true;
}

// Installation des interactions du module.
function install(client) {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (
        interaction.isChatInputCommand() &&
        interaction.commandName === 'jax'
      ) {
        const session = getSession(interaction.guildId);

        if (session?.active && session.userId === interaction.user.id) {
          await openJaxPanel(interaction);
        }

        return;
      }

      await handleButton(interaction);
    } catch (error) {
      console.error('[Jax Chaos]', error);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Une erreur est survenue dans Jax Chaos.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
    }
  });
}

module.exports = {
  install,
  activateJax,
  openJaxPanel,
  handleButton,
  restoreServer,
  getSession,
};
