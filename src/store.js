// Lightweight persistence. Intentionally minimal — this redesign avoids heavy
// scoring and streak pressure. We only remember the daily mystery result so the
// player can't redo today's, plus a count of cards seen for gentle feedback.
const KEY = 'hood.v2';

const empty = () => ({ dailyMystery: {}, seen: {} });

function load() {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return empty();
  }
}

export const store = {
  state: load(),
  save() {
    localStorage.setItem(KEY, JSON.stringify(this.state));
  },
  getDaily(dateKey) {
    return this.state.dailyMystery[dateKey] ?? null;
  },
  setDaily(dateKey, result) {
    this.state.dailyMystery[dateKey] = result;
    this.save();
  },
  markSeen(name) {
    this.state.seen[name] = (this.state.seen[name] ?? 0) + 1;
    this.save();
  },
  seenCount() {
    return Object.keys(this.state.seen).length;
  },
};
