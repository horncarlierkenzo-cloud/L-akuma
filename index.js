const {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  SlashCommandBuilder,
} = require('discord.js');
const { POWERS, UserError, shields } = require('./powers');

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN manquant : le bot ne se connecte pas.');
  return;
}

const ROLE_NAME = process.env.AKUMA_ROLE || 'Akumatisé';
const COOLDOWN_MS = 20 * 1000;
const cooldowns = new Map();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const commands = [
  new SlashCommandBuilder()
    .setName('pouvoir')
    .setDescription('Utilise le pouvoir donné par Papillon Ombre')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('cible').setDescription('Le joueur visé'))
    .addStringOption((o) => o.setName('texte').setDescription('Le texte du pouvoir (si besoin)').setMaxLength(300))
    .toJSON(),
];

async function registerCommands(guild) {
  try {
    await guild.commands.set(commands);
    console.log(`Commande /pouvoir enregistrée sur ${guild.name}`);
  } catch (e) {
    console.error(`Commande non enregistrée sur ${guild.name} : ${e.message} (réinvite le bot avec « applications.commands »)`);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
  for (const guild of client.guilds.cache.values()) await registerCommands(guild);
});
client.on(Events.GuildCreate, registerCommands);
client.on('error', console.error);

// Le pouvoir est lu dans le dernier message privé envoyé par le bot (pied de l'embed).
async function findPower(user) {
  try {
    const dm = await user.createDM();
    const msgs = await dm.messages.fetch({ limit: 50 });
    const mine = [...msgs.values()]
      .filter((m) => m.author.id === client.user.id)
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    for (const m of mine) {
      const footer = m.embeds[0] && m.embeds[0].footer && m.embeds[0].footer.text;
      if (!footer) continue;
      const power = POWERS.find((p) => footer === `Pouvoir : ${p.label} · /pouvoir`);
      if (power) return power;
    }
  } catch (e) {
    console.error('Lecture des messages privés impossible :', e.message);
  }
  return null;
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'pouvoir') return;
  if (!interaction.inGuild()) return;

  const fail = async (content) => {
    await interaction.deleteReply().catch(() => {});
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
  };

  try {
    await interaction.deferReply();

    const member = interaction.member;
    if (!member.roles.cache.some((r) => r.name === ROLE_NAME)) {
      return fail(`Tu n’es pas akumatisé : il faut le rôle « ${ROLE_NAME} ».`);
    }

    const wait = (cooldowns.get(interaction.user.id) || 0) - Date.now();
    if (wait > 0) return fail(`Ton pouvoir se recharge : encore ${Math.ceil(wait / 1000)} s.`);

    const power = await findPower(interaction.user);
    if (!power) return fail('Je ne trouve aucun pouvoir : Papillon Ombre ne t’a pas écrit en privé (ou tes messages privés sont fermés).');

    const text = (interaction.options.getString('texte') || '').trim();
    if (power.needsText && !text) return fail(`Ajoute un texte : /pouvoir ${power.needsTarget ? 'cible ' : ''}texte`);

    let target = null;
    if (power.needsTarget) {
      const user = interaction.options.getUser('cible');
      if (!user) return fail('Choisis une cible : /pouvoir cible:@joueur');
      if (user.bot) return fail('Tu ne peux pas viser un bot.');
      if (user.id === interaction.user.id) return fail('Tu ne peux pas te viser toi-même.');
      if ((shields.get(user.id) || 0) > Date.now()) return fail(`🪨 ${user.username} est en pierre : ton pouvoir glisse sur lui.`);
      try {
        target = await interaction.guild.members.fetch(user.id);
      } catch (_) {
        return fail('Ce joueur n’est pas sur le serveur.');
      }
    }

    const result = await power.run({
      interaction,
      caster: member,
      target,
      text,
      say: (payload) => interaction.followUp(payload),
    });

    cooldowns.set(interaction.user.id, Date.now() + COOLDOWN_MS);
    await interaction.editReply({ content: result });
  } catch (e) {
    if (e instanceof UserError) return fail(e.message);
    if (e.code === 50013) return fail('Je n’ai pas la permission d’agir sur ce joueur : son rôle est plus haut que le mien, ou il manque une permission au bot.');
    if (e.code === 40032) return fail('Ce joueur doit être connecté à un salon vocal.');
    console.error('Erreur /pouvoir :', e);
    return fail('Le pouvoir a échoué.');
  }
});

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('Connexion Discord impossible :', err.message);
});
