const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'site-data.json');

const FRAGMENTS = [
  'Le ticket doré',
  'Le masque brisé',
  'La clé du chapiteau',
  'L’étoile du Lucky Charm'
];

let database = {
  guilds: {}
};

// Charger les données sauvegardées
function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf8');
      database = JSON.parse(content);

      if (!database.guilds) {
        database.guilds = {};
      }
    }
  } catch (error) {
    console.error('Erreur de chargement des données :', error);
    database = { guilds: {} };
  }
}

function save() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(database, null, 2),
      'utf8'
    );
  } catch (error) {
    console.error('Erreur de sauvegarde :', error);
  }
}

function createGuild(guildId) {
  if (!database.guilds[guildId]) {
    database.guilds[guildId] = {
      akumas: {},
      logs: [],
      event: {
        active: false,
        startedAt: null,
        endedAt: null,
        stage: 'idle',
        fragments: [],
        players: {},
        snapshot: null,
        jaxUserId: null,
        createdChannels: [],
        changedByJax: false,
        fragmentsUnlocked: false,
        fragmentsComplete: false,
        luckyCharmUnlocked: false
      },
      purifications: []
    };

    save();
  }

  return database.guilds[guildId];
}

function getState(guildId) {
  return createGuild(guildId);
}

// Ajouter une entrée au journal
function addLog(guildId, message, type = 'info') {
  const state = createGuild(guildId);

  state.logs.unshift({
    message,
    type,
    date: new Date().toISOString()
  });

  state.logs = state.logs.slice(0, 200);

  save();
  return state.logs[0];
}

// Enregistrer une akumatisation
function setAkuma(guildId, userId, data) {
  const state = createGuild(guildId);

  state.akumas[userId] = {
    ...data,
    userId,
    date: new Date().toISOString()
  };

  save();
  return state.akumas[userId];
}

// Supprimer une akumatisation
function removeAkuma(guildId, userId) {
  const state = createGuild(guildId);

  const existed = Boolean(state.akumas[userId]);

  delete state.akumas[userId];

  save();
  return existed;
}

// Enregistrer une purification
function recordPurification(guildId, userId, character) {
  const state = createGuild(guildId);

  const purification = {
    userId,
    character,
    date: new Date().toISOString()
  };

  state.purifications.unshift(purification);
  state.purifications = state.purifications.slice(0, 100);

  delete state.akumas[userId];

  addLog(
    guildId,
    `${character || 'Un personnage'} a été désakumatisé !`,
    'purification'
  );

  save();
  return purification;
}

// Modifier les informations de l'événement
function setEvent(guildId, changes) {
  const state = createGuild(guildId);

  state.event = {
    ...state.event,
    ...changes
  };

  save();
  return state.event;
}

// Ajouter un fragment à l'événement
function addFragment(guildId, userId, character, fragment) {
  const state = createGuild(guildId);
  const event = state.event;

  if (!event.active) {
    return {
      ok: false,
      error: 'Aucun événement n’est actuellement actif.'
    };
  }

  if (!event.fragmentsUnlocked) {
    return {
      ok: false,
      error: 'Les fragments ne sont pas encore débloqués.'
    };
  }

  if (!FRAGMENTS.includes(fragment)) {
    return {
      ok: false,
      error: 'Ce fragment n’existe pas.'
    };
  }

  if (!event.players[userId]) {
    event.players[userId] = {
      character,
      fragments: [],
      date: new Date().toISOString()
    };
  }

  if (event.fragments.includes(fragment)) {
    return {
      ok: false,
      error: 'Ce fragment a déjà été récupéré.'
    };
  }

  event.fragments.push(fragment);

  event.players[userId].fragments.push(fragment);

  const count = event.fragments.length;
  const complete = count === FRAGMENTS.length;

  if (complete) {
    event.stage = 'final';
    event.fragmentsComplete = true;
    event.luckyCharmUnlocked = true;
  }

  addLog(
    guildId,
    `${character || 'Un participant'} a récupéré : ${fragment}`,
    'fragment'
  );

  save();

  return {
    ok: true,
    count,
    total: FRAGMENTS.length,
    complete,
    fragments: event.fragments
  };
}

// Initialisation
load();

module.exports = {
  addLog,
  recordPurification,
  setAkuma,
  removeAkuma,
  setEvent,
  addFragment,
  getState,
  FRAGMENTS
};
