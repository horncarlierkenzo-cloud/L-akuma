const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const { UserError } = require('./powers');

const MIN = 60 * 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rand = (n) => Math.floor(Math.random() * n);
const pick = (array) => array[rand(array.length)];

// Effets temporaires sur les messages des joueurs.
const effects = {
  mime: new Map(),
  simon: new Map(),
  copycat: new Map(),
  oblivio: new Map(),
};

const DUREE = 3 * MIN;

function voiceNamed(interaction, regex, label) {
  const channel = interaction.guild.channels.cache.find(
    (item) => item.isVoiceBased() && regex.test(item.name)
  );

  if (!channel) {
    throw new UserError(
      `Il faut un salon vocal nommé « ${label} » sur le serveur.`
    );
  }

  return channel;
}

// ------------------------------
// Mini-jeux de Gamer
// ------------------------------

const GAMES = [
  () => {
    const number = 1 + rand(3);

    return {
      q: '🔢 Je pense à un nombre de 1 à 3. Devine-le !',
      labels: ['1', '2', '3'],
      win: (index) => index + 1 === number,
    };
  },

  () => {
    const answer = rand(3);

    return {
      q: '✊ Pierre, feuille ou ciseaux ? Bats-moi !',
      labels: ['🪨 Pierre', '📄 Feuille', '✂️ Ciseaux'],
      win: (index) => (index + 2) % 3 === answer,
    };
  },

  () => {
    const question = pick([
      [
        'Quel est le vrai prénom de Ladybug ?',
        ['Alya', 'Marinette', 'Chloé'],
        1,
      ],
      [
        'Comment s’appelle le kwami de Chat Noir ?',
        ['Plagg', 'Tikki', 'Wayzz'],
        0,
      ],
      [
        'Qui est Papillon ?',
        ['Nathaniel', 'Gabriel Agreste', 'Lila'],
        1,
      ],
    ]);

    return {
      q: '🦋 Quiz : ' + question[0],
      labels: question[1],
      win: (index) => index === question[2],
    };
  },

  () => {
    const a = 2 + rand(8);
    const b = 2 + rand(8);
    const result = a * b;

    return {
      q: `🧮 ${a} × ${b} = ?`,
      labels: [result - 2, result, result + 1].map(String),
      win: (index) => index === 1,
    };
  },

  () => {
    const emojis = ['🐞', '🐱', '🦋', '🌸', '⭐'];
    const sequence = [
      pick(emojis),
      pick(emojis),
      pick(emojis),
    ];

    return {
      show: `🧠 Retiens ces emojis : ${sequence.join(' ')}`,
      q: '🧠 Quel était le deuxième emoji ?',
      labels: emojis,
      win: (index) => emojis[index] === sequence[1],
    };
  },

  () => ({
    reflex: true,
  }),
];

// ------------------------------
// Fonction du mini-jeu Gamer
// ------------------------------

async function play({ caster, target, say }) {
  const game = pick(GAMES)();

  const heading =
    `🎮 ${target}, ${caster} t’a piégé(e) dans son jeu !`;

  const rows = (labels) => [
    new ActionRowBuilder().addComponents(
      labels.map((label, index) =>
        new ButtonBuilder()
          .setCustomId('g' + index)
          .setLabel(label)
          .setStyle(ButtonStyle.Primary)
      )
    ),
  ];

  const filter = (interaction) =>
    interaction.user.id === target.id;

  let message;
  let success = false;

  try {
    if (game.reflex) {
      message = await say({
        content:
          `${heading}\n⚡ Prépare-toi… clique dès que le bouton apparaît !`,
        fetchReply: true,
      });

      await sleep(1000 + rand(3000));

      await message.edit({
        components: rows(['CLIQUE !']),
      });

      const click = await message.awaitMessageComponent({
        filter,
        time: 2000,
      });

      success = true;

      await click.update({
        components: [],
      });
    } else {
      message = await say({
        content:
          `${heading}\n${game.show || game.q}`,
        components: game.show ? [] : rows(game.labels),
        fetchReply: true,
      });

      if (game.show) {
        await sleep(3000);

        await message.edit({
          content: `${heading}\n${game.q}`,
          components: rows(game.labels),
        });
      }

      const click = await message.awaitMessageComponent({
        filter,
        time: 15000,
      });

      success = game.win(
        Number(click.customId.slice(1))
      );

      await click.update({
        components: [],
      });
    }
  } catch {
    success = false;
  }

  if (!success) {
    await target.timeout(2 * MIN, 'Gamer').catch(() => {});
  }

  if (message) {
    await message.edit({
      content: success
        ? `🎮 ${target} s’échappe du jeu !`
        : `🎮 ${target} a perdu : immobilisé(e) pendant 2 minutes.`,
      components: [],
    }).catch(() => {});
  }

  return success
    ? '🎮 Le défi du Gamer a échoué.'
    : '🎮 Le Gamer a gagné la partie !';
}

// ------------------------------
// Pouvoirs supplémentaires
// ------------------------------

const POWERS = [
  {
    key: 'gamer',
    label: 'Gamer',
    needsTarget: true,
    run: play,
  },

  {
    key: 'glace',
    label: 'Glace',
    needsTarget: true,

    async run({ caster, target }) {
      await target.timeout(3 * MIN, 'Glace');

      return `❄️ ${caster} gèle ${target} pendant 3 minutes.`;
    },
  },

  {
    key: 'mime',
    label: 'Mime',
    needsTarget: true,

    async run({ caster, target }) {
      effects.mime.set(target.id, {
        end: Date.now() + DUREE,
      });

      return `🤐 ${caster} transforme ${target} en mime : emojis seulement pendant 3 minutes.`;
    },
  },

  {
    key: 'simon-says',
    label: 'Simon Says',
    needsTarget: true,
    needsText: true,

    async run({ caster, target, text }) {
      effects.simon.set(target.id, {
        end: Date.now() + DUREE,
        phrase: text,
      });

      return `📢 ${caster} ordonne à ${target} d’écrire : « ${text} » pendant 3 minutes.`;
    },
  },

  {
    key: 'copycat',
    label: 'Copycat',
    needsTarget: true,

    async run({ caster, target }) {
      effects.copycat.set(target.id, {
        end: Date.now() + DUREE,
      });

      return `🐱 ${caster} lance Copycat : les messages de ${target} seront répétés pendant 3 minutes.`;
    },
  },

  {
    key: 'oblivio',
    label: 'Oblivio',
    needsTarget: true,

    async run({ caster, target }) {
      effects.oblivio.set(target.id, {
        end: Date.now() + DUREE,
      });

      return `🫥 ${caster} lance Oblivio : les messages de ${target} disparaîtront pendant 3 minutes.`;
    },
  },

  {
    key: 'stormy-weather',
    label: 'Stormy Weather',
    needsTarget: true,

    async run({ interaction, caster, target }) {
      const channel = voiceNamed(
        interaction,
        /temp[eê]te/i,
        'Tempête'
      );

      if (!target.voice.channelId) {
        throw new UserError(
          'La cible doit être dans un salon vocal.'
        );
      }

      await target.voice.setChannel(
        channel,
        'Stormy Weather'
      );

      return `⛈️ ${caster} envoie ${target} dans la tempête.`;
    },
  },

  {
    key: 'rogercop',
    label: 'Rogercop',
    needsTarget: true,

    async run({ interaction, caster, target }) {
      const channel = voiceNamed(
        interaction,
        /prison/i,
        'Prison'
      );

      if (!target.voice.channelId) {
        throw new UserError(
          'La cible doit être dans un salon vocal.'
        );
      }

      await target.voice.setChannel(
        channel,
        'Rogercop'
      );

      return `🚓 ${caster} enferme ${target} dans la prison.`;
    },
  },
];

module.exports = {
  POWERS,
  effects,
};
