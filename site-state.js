
'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'site-state.json');

function initialState() {
  return {
    logs: [],
    purifications: [],
    akuma: {},
    event: {
      active: false,
      startedAt: null,
      endedAt: null,
      stage: 'inactif',
      fragments: [],
      players: {},
      snapshot: null,
      jaxUserId: null,
      createdChannels: [],
      changedByJax: []
    }
  };
}

function readState() {
  try {
    const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const defaults = initialState();

    return {
      ...defaults,
      ...saved,
      logs: Array.isArray(saved.logs) ? saved.logs : [],
      purifications: Array.isArray(saved.purifications) ? saved.purifications : [],
      akuma: saved.akuma && typeof saved.akuma === 'object'
        ? saved.akuma
        : {},
      event: {
        ...defaults.event,
        ...(saved.event || {}),
        fragments: Array.isArray(saved.event?.fragments)
          ? saved.event.fragments
          : [],
        players: saved.event?.players && typeof saved.event.players === 'object'
          ? saved.event.players
          : {},
        createdChannels: Array.isArray(saved.event?.createdChannels)
          ? saved.event.createdChannels
          : [],
        changedByJax: Array.isArray(saved.event?.changedByJax)
          ? saved.event.changedByJax
          : []
      }
    };
  } catch {
    return initialState();
  }
}

let state = readState();

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const temporaryFile = `${FILE}.tmp`;

  fs.writeFileSync(
    temporaryFile,
    JSON.stringify(state, null, 2),
    'utf8'
  );

  fs.renameSync(temporaryFile, FILE);
}

function addLog(message, success = true, type = 'info') {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    text: String(message).slice(0, 500),
    ok: Boolean(success),
    type: String(type || 'info')
  };

  state.logs.unshift(entry);
  state.logs = state.logs.slice(0, 250);

  save();
  return entry;
}

function setAkuma(guildId, userId, entry) {
  const key = `${guildId}:${userId}`;

  state.akuma[key] = {
    ...entry,
    guildId: String(guildId),
    userId: String(userId)
  };

  save();
  return state.akuma[key];
}

function removeAkuma(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const existed = Boolean(state.akuma[key]);

  delete state.akuma[key];

  save();
  return existed;
}

function recordPurification(
  guildId,
  userId,
  username,
  source = 'Ladybug'
) {
  const item = {
    id: `${Date.now()}-${userId}`,
    guildId: String(guildId),
    userId: String(userId),
    username: String(username || userId),
    source: String(source),
    at: Date.now(),
    status: 'Désakumatisé'
  };

  state.purifications.unshift(item);
  state.purifications = state.purifications.slice(0, 250);

  delete state.akuma[`${guildId}:${userId}`];

  addLog(
    `🐞 ${item.username} a été désakumatisé par ${item.source}.`,
    true,
    'purification'
  );

  save();
  return item;
}

// Fusionne les informations reçues sans effacer les autres données
// de l'événement déjà enregistrées.
function setEvent(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new TypeError('Les données de l’événement sont invalides.');
  }

  state.event = {
    ...state.event,
    ...patch
  };

  save();
  return state.event;
}

function addFragment(guildId, userId, character, fragment) {
  const event = state.event;

  if (!event.active) {
    return {
      ok: false,
      reason: 'L’événement n’est pas actif.'
    };
  }

  const characterName = String(character || '').trim();
  const fragmentName = String(fragment || '').trim();

  if (!characterName || !fragmentName) {
    return {
      ok: false,
      reason: 'Le personnage ou le fragment est invalide.'
    };
  }

  event.fragments ||= [];
  event.players ||= {};

  // Un fragment ne peut être débloqué qu'une seule fois
  // pendant l'événement.
  if (event.fragments.includes(fragmentName)) {
    return {
      ok: false,
      reason: 'Ce fragment a déjà été récupéré.'
    };
  }

  const playerKey = `${guildId}:${userId}`;

  if (!event.players[playerKey]) {
    event.players[playerKey] = {
      completed: [],
      characters: []
    };
  }

  const player = event.players[playerKey];

  if (!Array.isArray(player.completed)) player.completed = [];
  if (!Array.isArray(player.characters)) player.characters = [];

  if (player.completed.includes(fragmentName)) {
    return {
      ok: false,
      reason: 'Tu as déjà récupéré ce fragment.'
    };
  }

  player.completed.push(fragmentName);
  player.characters.push(characterName);

  event.fragments.push(fragmentName);

  // Les quatre fragments débloquent l'étape finale.
  const count = event.fragments.length;
  const total = 4;

  if (count >= total) {
    event.stage = 'final';
    event.fragmentsComplete = true;
    event.luckyCharmUnlocked = true;

    addLog(
      '🐞 Les quatre fragments du Lucky Charm ont été réunis !',
      true,
      'fragment'
    );
  }

  addLog(
    `🎟️ ${characterName} a débloqué le fragment « ${fragmentName} » avec <@${userId}>.`,
    true,
    'fragment'
  );

  save();

  return {
    ok: true,
    count,
    total,
    complete: count >= total
  };
}

function getState() {
  // Renvoie une copie pour éviter qu'un autre fichier
  // modifie directement les données sauvegardées.
  return JSON.parse(JSON.stringify(state));
}

module.exports = {
  addLog,
  recordPurification,
  setAkuma,
  removeAkuma,
  setEvent,
  addFragment,
  getState
};
