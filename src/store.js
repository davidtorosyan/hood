// Minimal localStorage. Light state only — no scores, no streaks:
//   - progress: which puzzles you've finished ('solved' by hand, or 'skipped'
//     with the Solve button). Unfinished puzzles start themselves when you
//     arrive; finished ones open assembled for browsing.
//   - coached: you've seen the first-drag demo.
//   - nav: the level you were on, so a reload drops you back in.
//   - puzzles: each level's puzzle in progress, so leaving a level mid-puzzle
//     (zooming out, searching, a reload) and coming back picks it up again.
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
// Fields from older builds that nothing reads any more.
delete state.seen;
delete state.mode;
delete state.learnedZoom;

export const store = {
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
  // Were they on the home screen last? Then a relaunch opens home, not the game.
  atHome() {
    return !!state.atHome;
  },
  setAtHome(v) {
    state.atHome = v;
    save(state);
  },
};
