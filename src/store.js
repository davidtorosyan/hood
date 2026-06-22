// Minimal localStorage: which pieces the player has placed (seen). Light state,
// no scoring or streaks — the game stays forgiving and pressure-free.
const KEY = 'hood.v2';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota — ignore, the game still works in-session */
  }
}

const state = load();
state.seen ||= {};

export const store = {
  markSeen(id) {
    state.seen[id] = (state.seen[id] || 0) + 1;
    save(state);
  },
  seenCount(id) {
    return state.seen[id] || 0;
  },
};
