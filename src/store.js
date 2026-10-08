// Minimal localStorage. Light state only — no scores, no streaks:
//   - progress: which puzzles you've finished ('solved' by hand, or 'skipped'
//     with the Solve button). Unfinished puzzles start themselves when you
//     arrive; finished ones open assembled for browsing.
//   - coached: you've seen the first-drag demo.
//   - counts / trophies / visited: light progression (see src/progress.js).
//   - nav: the level you were on, so a reload drops you back in.
//   - puzzles: each level's puzzle in progress, so leaving a level mid-puzzle
//     (zooming out, searching, a reload) and coming back picks it up again.
//   - campaign: the same two (progress + puzzles) for "Rebuild LA", kept apart
//     so free exploring doesn't spoil the campaign's order. A Board reads and
//     writes through a "ledger" (`store.explore` or `store.campaign`).
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
state.progress ||= {};
state.puzzles ||= {};
state.counts ||= {}; // lifetime tallies: placed, cards, hops, flawless
state.trophies ||= {}; // trophy id → time earned
state.visited ||= {}; // region id → 1 once you've been inside it
state.campaign ||= { progress: {}, puzzles: {} }; // "Rebuild LA" — its own ledger
state.freeways ||= { progress: {}, puzzles: {} }; // Freeways (prototype) — its own ledger
// Fields from older builds that nothing reads any more.
delete state.seen;
delete state.mode;
delete state.learnedZoom;

// A ledger: per-puzzle progress + in-progress saves. Explore and the campaign
// each have one; a Board is handed the one it plays for.
function ledger(bag) {
  return {
    progress: (id) => bag.progress[id],
    isSolved: (id) => bag.progress[id] === 'solved',
    // A hand solve always wins over an earlier skip.
    markDone(id, how) {
      if (bag.progress[id] === 'solved') return;
      bag.progress[id] = how;
      save(state);
    },
    puzzle: (id) => bag.puzzles[id] || null,
    savePuzzle(id, data) {
      if (data) bag.puzzles[id] = data;
      else delete bag.puzzles[id];
      save(state);
    },
    solvedCount: () => Object.values(bag.progress).filter((v) => v === 'solved').length,
    // Built in the campaign: solved by hand OR with the Solve button.
    doneIds: () => Object.keys(bag.progress),
    // Small extra state a mode keeps alongside (e.g. the campaign's offered
    // choices, the last area built).
    get: (key) => bag[key],
    set(key, value) {
      bag[key] = value;
      save(state);
    },
  };
}

export const store = {
  explore: ledger(state),
  campaign: ledger(state.campaign),
  freeways: ledger(state.freeways),
  // Which screen they were on last: 'home' | 'explore' | 'campaign' | 'freeways'.
  screen() {
    return state.screen || (state.atHome ? 'home' : state.nav ? 'explore' : 'home');
  },
  setScreen(v) {
    state.screen = v;
    save(state);
  },
  // 'solved' | 'skipped' | undefined
  progress(id) {
    return state.progress[id];
  },
  isSolved(id) {
    return state.progress[id] === 'solved';
  },
  // A hand solve always wins over an earlier skip.
  markDone(id, how) {
    if (state.progress[id] === 'solved') return;
    state.progress[id] = how;
    save(state);
  },
  solvedCount() {
    return Object.values(state.progress).filter((v) => v === 'solved').length;
  },

  // Lifetime tallies (pieces placed, cards opened, …) for trophies.
  count(name) {
    return state.counts[name] || 0;
  },
  bump(name, by = 1) {
    state.counts[name] = (state.counts[name] || 0) + by;
    save(state);
  },
  // Puzzles solved without a single miss (each counts once, however often replayed).
  flawlessCount() {
    return (state.flawless ||= []).length;
  },
  markFlawless(id) {
    state.flawless ||= [];
    if (state.flawless.includes(id)) return;
    state.flawless.push(id);
    save(state);
  },
  // Forget progress for puzzles that no longer exist (renamed in a data update),
  // so counts and trophies only ever reflect real puzzles.
  prune(validIds) {
    let changed = false;
    for (const bag of [state.progress, state.puzzles, state.campaign.progress, state.campaign.puzzles]) {
      for (const id of Object.keys(bag)) if (!validIds.has(id)) {
        delete bag[id];
        changed = true;
      }
    }
    if (state.flawless) {
      const keep = state.flawless.filter((id) => validIds.has(id));
      changed ||= keep.length !== state.flawless.length;
      state.flawless = keep;
    }
    if (changed) save(state);
  },
  trophies() {
    return state.trophies;
  },
  award(id) {
    state.trophies[id] = Date.now();
    save(state);
  },
  visited() {
    return state.visited;
  },
  visit(regionId) {
    if (state.visited[regionId]) return false;
    state.visited[regionId] = 1;
    save(state);
    return true;
  },
  solvedIds() {
    return Object.keys(state.progress).filter((id) => state.progress[id] === 'solved');
  },

  coached() {
    return !!state.coached;
  },
  markCoached() {
    state.coached = true;
    save(state);
  },

  // Where the player last was: { node }. Kept when they go home, so the home
  // screen can offer Continue.
  nav() {
    return state.nav || null;
  },
  saveNav(nav) {
    state.nav = nav;
    save(state);
  },
  // A level's serialized puzzle in progress (null/undefined when none).
  puzzle(id) {
    return state.puzzles[id] || null;
  },
  savePuzzle(id, data) {
    if (data) state.puzzles[id] = data;
    else delete state.puzzles[id];
    save(state);
  },
  clearNav() {
    delete state.nav;
    save(state);
  },
  // Erase everything (the "Start over" button — e.g. to replay the new-player
  // experience). The caller reloads, since this module holds state in memory.
  resetAll() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing saved to clear */
    }
  },
  // Were they on the home screen last? Then a relaunch opens home, not the game.
  atHome() {
    return !!state.atHome;
  },
  setAtHome(v) {
    state.atHome = v;
    save(state);
  },
};
