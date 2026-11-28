async function akumatizeJax(guild, member, body, guildId) {
  const event = siteState.getState().event;

  if (!event.active) {
    throw new Error(
      'L’événement doit être démarré avant d’akumatiser Jax Chaos.'
    );
  }

  if (member.roles.cache.some(r => r.name === ROLE_NAME)) {
    throw new Error('Ce membre est déjà akumatisé.');
  }

  if (typeof jaxChaos.activateJax !== 'function') {
    throw new Error(
      'La fonction activateJax est introuvable dans jax-chaos.js.'
    );
  }

  const emotion = String(body.emotion || 'Chaos').slice(0, 80);

  const dmText = String(
    body.dm ||
    '🦋 Jax… ton esprit est rempli de chaos. Je t’offre le pouvoir de bouleverser ce cirque. Tu es désormais Jax Chaos ! Utilise **/jax** pour ouvrir ton panneau privé.'
  ).slice(0, 3500);

  const role = await ensureRole(guild, ROLE_NAME);

  await sendPrivate(
    member,
    fill(dmText, {
      user: `<@${member.id}>`,
      name: member.displayName,
      emotion,
      power: 'Jax Chaos'
    }),
    null
  );

  await member.roles.add(
    role,
    'Akumatisation spéciale Jax Chaos'
  );

  const entry = {
    name: member.displayName,
    emotion,
    power: 'Jax Chaos',
    powerKey: 'jax-chaos',
    jaxChaos: true,
    originalNick: member.nickname,
    startedAt: Date.now(),
    endsAt: Number(body.durationMin) > 0
      ? Date.now() +
        Math.min(10080, Number(body.durationMin)) * 60000
      : null,
    amok: null
  };

  siteState.setAkuma(guildId, member.id, entry);

  // Active les effets spéciaux de Jax Chaos sur le serveur.
  await jaxChaos.activateJax(guild, member, entry);

  // Déverrouille les fragments du Lucky Charm.
  siteState.setEvent({
    active: true,
    stage: 'chaos',
    fragmentsUnlocked: true,
    jaxUserId: member.id,
    jaxUsername: member.displayName,
    jaxAkumatizedAt: Date.now()
  });

  if (body.changeNick) {
    await member.setNickname(
      fill(
        String(body.nickFormat || '🐰 Jax Chaos · {name}'),
        { name: member.displayName }
      ).slice(0, 32),
      'Akumatisation Jax Chaos'
    ).catch(() => {});
  }

  const announcement = String(
    body.announcement ||
    '🦋 **ALERTE ! Jax vient d’être akumatisé en Jax Chaos !** Le Digital Circus est contaminé par le chaos. Les missions des fragments du Lucky Charm sont maintenant accessibles !'
  ).slice(0, 1800);

  if (body.channelId) {
    const channel = await guild.channels.fetch(
      String(body.channelId)
    );

    if (!channel || !channel.isTextBased()) {
      throw new Error('Salon d’annonce introuvable.');
    }

    await channel.send({
      content: fill(announcement, {
        user: `<@${member.id}>`,
        name: member.displayName,
        emotion,
        power: 'Jax Chaos'
      }),
      allowedMentions: {
        users: [member.id]
      }
    });
  }

  siteState.addLog(
    `🐰 ${member.displayName} est devenu Jax Chaos. Les fragments sont déverrouillés.`,
    true,
    'jax'
  );

  return {
    ok: true,
    member: member.displayName,
    eventStage: 'chaos'
  };
}
