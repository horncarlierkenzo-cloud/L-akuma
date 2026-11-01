const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');

const MIN = 60 * 1000;

class UserError extends Error {}

// Joueurs protégés par Stoneheart : id -> fin de la protection
const shields = new Map();

// Change le pseudo, puis le remet comme avant au bout de `ms`
async function tempNick(member, nick, ms) {
  const original = member.nickname;
  await member.setNickname(nick.slice(0, 32), 'Pouvoir');
  setTimeout(() => { member.setNickname(original, 'Fin du pouvoir').catch(() => {}); }, ms);
}

const ANIMAUX = ['Lion', 'Renard', 'Panda', 'Hibou', 'Loup', 'Chat', 'Grenouille', 'Girafe', 'Pingouin', 'Koala'];

// Les libellés (label) doivent rester identiques à ceux du site.
const POWERS = [
  {
    key: 'marionnettiste', label: 'Marionnettiste', needsTarget: true, needsText: true,
    async run({ caster, target, text, say }) {
      await target.timeout(MIN, 'Marionnettiste');
      await say({
        embeds: [new EmbedBuilder()
          .setAuthor({ name: target.displayName, iconURL: target.displayAvatarURL() })
          .setDescription(text)
          .setColor(0x7b2cbf)
          .setFooter({ text: '🎭 Contrôlé par le Marionnettiste' })],
      });
      return `🎭 ${target} est devenu(e) la marionnette de ${caster}.`;
    },
  },
  {
    key: 'dark-cupid', label: 'Dark Cupid', needsTarget: true,
    async run({ caster, target }) {
      await tempNick(target, `💘 Fan de ${caster.displayName}`, 5 * MIN);
      return `💘 La flèche de ${caster} a touché ${target} : le voilà fan pour 5 minutes.`;
    },
  },
  {
    key: 'sandboy', label: 'Sandboy', needsTarget: true,
    async run({ caster, target }) {
      await target.timeout(2 * MIN, 'Sandboy');
      return `😴 ${caster} endort ${target} pour 2 minutes.`;
    },
  },
  {
    key: 'pixelator', label: 'Pixelator', needsTarget: true,
    async run({ caster, target }) {
      await tempNick(target, '🟪 Pixel', MIN);
      await target.timeout(MIN, 'Pixelator');
      return `🟪 ${caster} transforme ${target} en pixels : figé(e) 1 minute.`;
    },
  },
  {
    key: 'timebreaker', label: 'Timebreaker',
    async run({ interaction, caster }) {
      const channel = interaction.channel;
      if (!channel || !channel.permissionOverwrites) throw new UserError('Ce pouvoir ne marche pas dans ce type de salon.');
      const everyone = interaction.guild.roles.everyone;
      const prev = channel.permissionOverwrites.cache.get(everyone.id);
      const prevSend = prev
        ? (prev.allow.has(PermissionFlagsBits.SendMessages) ? true : prev.deny.has(PermissionFlagsBits.SendMessages) ? false : null)
        : null;
      await channel.permissionOverwrites.edit(caster, { SendMessages: true });
      await channel.permissionOverwrites.edit(everyone, { SendMessages: false });
      setTimeout(async () => {
        await channel.permissionOverwrites.edit(everyone, { SendMessages: prevSend }).catch(() => {});
        await channel.permissionOverwrites.delete(caster).catch(() => {});
      }, 20 * 1000);
      return `⏳ ${caster} fige le temps : plus personne ne peut écrire ici pendant 20 secondes.`;
    },
  },
  {
    key: 'reflekta', label: 'Reflekta', needsTarget: true,
    async run({ interaction, caster, target }) {
      const mirror = interaction.guild.channels.cache.find((c) => c.type === ChannelType.GuildVoice && /miroir/i.test(c.name));
      if (!mirror) throw new UserError('Il faut un salon vocal nommé « Miroir » sur le serveur.');
      if (!target.voice.channelId) throw new UserError('La cible doit être dans un salon vocal.');
      await target.voice.setChannel(mirror, 'Reflekta');
      return `🪞 ${caster} piège ${target} dans le miroir.`;
    },
  },
  {
    key: 'gamer', label: 'Gamer', needsTarget: true,
    async run({ interaction, caster, target, say }) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('gamer-start').setLabel('START').setStyle(ButtonStyle.Success),
      );
      const msg = await say({
        content: `🎮 ${target}, ${caster} t’a piégé(e) dans son jeu ! Appuie sur START dans les 15 secondes pour t’échapper.`,
        components: [row],
        fetchReply: true,
      });
      try {
        const click = await msg.awaitMessageComponent({ filter: (i) => i.user.id === target.id, time: 15 * 1000 });
        await click.update({ content: `🎮 ${target} a réussi à s’échapper du jeu !`, components: [] });
        return '🎮 Le défi du Gamer a échoué.';
      } catch (_) {
        await target.timeout(2 * MIN, 'Gamer').catch(() => {});
        await msg.edit({ content: `🎮 ${target} a perdu la partie : figé(e) pendant 2 minutes.`, components: [] }).catch(() => {});
        return '🎮 Le Gamer a gagné la partie !';
      }
    },
  },
  {
    key: 'evillustrator', label: 'Evillustrator', needsText: true,
    async run({ caster, text, say }) {
      await say({
        embeds: [new EmbedBuilder()
          .setTitle('✏️ L’Evillustrator dessine…')
          .setDescription(text)
          .setColor(0x7b2cbf)
          .setFooter({ text: `Dessiné par ${caster.displayName}` })],
      });
      return '✏️ Le dessin prend vie !';
    },
  },
  {
    key: 'stoneheart', label: 'Stoneheart',
    async run({ caster }) {
      shields.set(caster.id, Date.now() + 5 * MIN);
      return `🪨 ${caster} se change en pierre : les pouvoirs des autres glissent sur lui pendant 5 minutes.`;
    },
  },
  {
    key: 'animan', label: 'Animan', needsTarget: true,
    async run({ caster, target }) {
      const animal = ANIMAUX[Math.floor(Math.random() * ANIMAUX.length)];
      await tempNick(target, `🐾 ${animal}`, 5 * MIN);
      return `🐾 ${caster} transforme ${target} en ${animal.toLowerCase()} pour 5 minutes.`;
    },
  },
  {
    key: 'lady-wifi', label: 'Lady Wifi', needsTarget: true, needsText: true,
    async run({ caster, target, text }) {
      try {
        await target.send({
          embeds: [new EmbedBuilder().setTitle('📡 Message de Lady Wifi').setDescription(text).setColor(0x7b2cbf)],
        });
      } catch (_) {
        throw new UserError('Message privé impossible : ce joueur bloque les messages privés.');
      }
      return `📡 ${caster} envoie un message privé à ${target}.`;
    },
  },
  {
    key: 'guitar-villain', label: 'Guitar Villain', needsTarget: true,
    async run({ caster, target }) {
      if (!target.voice.channelId) throw new UserError('La cible doit être dans un salon vocal.');
      await target.voice.disconnect('Guitar Villain');
      return `🎸 L’onde sonore de ${caster} éjecte ${target} du salon vocal.`;
    },
  },
];

module.exports = { POWERS, UserError, shields };
