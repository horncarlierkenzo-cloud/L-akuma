const siteState = require('./site-state');

// Sauvegarder l'état du serveur avant le chaos
async function captureServer(guild) {
  if (!guild) {
    throw new Error('Serveur Discord introuvable.');
  }

  await guild.channels.fetch();

  const channels = [];

  for (const channel of guild.channels.cache.values()) {
    channels.push({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      topic: channel.topic ?? null,
      nsfw: channel.nsfw ?? false,
      rateLimitPerUser: channel.rateLimitPerUser ?? 0,
      parentId: channel.parentId ?? null,
      position: channel.position,
      bitrate: channel.bitrate ?? null,
      userLimit: channel.userLimit ?? null,
      permissionOverwrites:
        channel.permissionOverwrites?.cache.map(overwrite => ({
          id: overwrite.id,
          type: overwrite.type,
          allow: overwrite.allow.bitfield.toString(),
          deny: overwrite.deny.bitfield.toString()
        })) ?? []
    });
  }

  const snapshot = {
    capturedAt: new Date().toISOString(),
    channels
  };

  siteState.setEvent(guild.id, {
    snapshot,
    changedByJax: false,
    createdChannels: []
  });

  console.log(`[JAX CHAOS] Sauvegarde effectuée : ${guild.name}`);

  return snapshot;
}

// Enregistrer un salon créé pendant le chaos
function registerCreatedChannel(guildId, channelId) {
  const state = siteState.getState(guildId);
  const event = state.event;

  if (!event.createdChannels.includes(channelId)) {
    event.createdChannels.push(channelId);

    siteState.setEvent(guildId, {
      createdChannels: event.createdChannels
    });
  }
}

// Restaurer le serveur après Miraculous Ladybug
async function restoreServer(guild) {
  if (!guild) {
    throw new Error('Serveur Discord introuvable.');
  }

  const state = siteState.getState(guild.id);
  const event = state.event;
  const snapshot = event.snapshot;

  if (!snapshot) {
    throw new Error('Aucune sauvegarde du serveur disponible.');
  }

  console.log(`[JAX CHAOS] Restauration de ${guild.name}...`);

  await guild.channels.fetch();

  const errors = [];

  // Restaurer les salons existants
  for (const saved of snapshot.channels) {
    try {
      const channel = guild.channels.cache.get(saved.id);

      if (!channel) {
        errors.push(`Salon introuvable : ${saved.name}`);
        continue;
      }

      const changes = {};

      if (saved.name !== undefined) {
        changes.name = saved.name;
      }

      if (saved.topic !== null && saved.topic !== undefined) {
        changes.topic = saved.topic;
      } else if (channel.topic !== undefined) {
        changes.topic = null;
      }

      if (saved.nsfw !== undefined) {
        changes.nsfw = saved.nsfw;
      }

      if (saved.rateLimitPerUser !== undefined) {
        changes.rateLimitPerUser = saved.rateLimitPerUser;
      }

      if (
        saved.parentId !== undefined &&
        channel.parentId !== saved.parentId
      ) {
        changes.parent = saved.parentId;
      }

      if (saved.position !== undefined) {
        changes.position = saved.position;
      }

      if (
        saved.bitrate !== null &&
        saved.bitrate !== undefined &&
        channel.bitrate !== undefined
      ) {
        changes.bitrate = saved.bitrate;
      }

      if (
        saved.userLimit !== null &&
        saved.userLimit !== undefined &&
        channel.userLimit !== undefined
      ) {
        changes.userLimit = saved.userLimit;
      }

      if (Object.keys(changes).length > 0) {
        await channel.edit(changes, 'Restauration après Jax Chaos');
      }

      // Restaurer les permissions
      if (channel.permissionOverwrites) {
        await channel.permissionOverwrites.set(
          saved.permissionOverwrites.map(overwrite => ({
            id: overwrite.id,
            type: overwrite.type,
            allow: BigInt(overwrite.allow),
            deny: BigInt(overwrite.deny)
          })),
          'Restauration après Jax Chaos'
        );
      }

    } catch (error) {
      console.error(
        `[JAX CHAOS] Erreur salon ${saved.name}:`,
        error.message
      );

      errors.push(saved.name);
    }
  }

  // Supprimer les salons créés pendant le chaos
  for (const channelId of event.createdChannels || []) {
    try {
      const channel = guild.channels.cache.get(channelId);

      if (channel) {
        await channel.delete('Nettoyage après Jax Chaos');
      }
    } catch (error) {
      console.error(
        '[JAX CHAOS] Suppression impossible :',
        error.message
      );

      errors.push(channelId);
    }
  }

  // Terminer la restauration
  siteState.setEvent(guild.id, {
    snapshot: null,
    createdChannels: [],
    changedByJax: false,
    fragments: [],
    players: {},
    fragmentsUnlocked: false,
    fragmentsComplete: false,
    luckyCharmUnlocked: false,
    stage: 'finished',
    jaxUserId: null
  });

  console.log(`[JAX CHAOS] Restauration terminée : ${guild.name}`);

  return {
    ok: errors.length === 0,
    errors
  };
}

module.exports = {
  captureServer,
  restoreServer,
  registerCreatedChannel
};
