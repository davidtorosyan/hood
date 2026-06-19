// Persists per-neighborhood mastery and overall stats in localStorage, and
// picks which neighborhoods to quiz using a lightweight Leitner box scheme.
const KEY = 'hood.progress.v1';

const empty = () => ({ hoods: {}, stats: { sessions: 0, bestStreak: 0 } });

function load() {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return empty();
  }
}

function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function hoodRecord(state, name) {
  return (state.hoods[name] ??= { seen: 0, correct: 0, miss: 0, box: 0, lastSeen: 0 });
}

// Lower box + fewer views = higher priority. Unseen always floats to the top.
function weight(rec, sessionCount) {
  if (rec.seen === 0) return 1000;
  const staleness = sessionCount - rec.lastSeen;
  return (6 - rec.box) * 10 + staleness;
}

export const store = {
  state: load(),

  // Pick `count` neighborhoods to quiz this session, weighted toward the
  // least-mastered, with a little randomness so sessions vary.
  pickSession(pool, count) {
    const s = this.state;
    const sessionCount = s.stats.sessions;
    const ranked = pool
      .map((name) => ({ name, w: weight(hoodRecord(s, name), sessionCount) + Math.random() * 8 }))
      .sort((a, b) => b.w - a.w);
    return ranked.slice(0, count).map((r) => r.name);
  },

  record(name, correct) {
    const s = this.state;
    const rec = hoodRecord(s, name);
    rec.seen += 1;
    rec.lastSeen = s.stats.sessions;
    if (correct) {
      rec.correct += 1;
      rec.box = Math.min(5, rec.box + 1);
    } else {
      rec.miss += 1;
      rec.box = 0;
    }
    save(s);
  },

  endSession(bestStreakThisSession) {
    const s = this.state;
    s.stats.sessions += 1;
    s.stats.bestStreak = Math.max(s.stats.bestStreak, bestStreakThisSession);
    save(s);
  },

  masteryOf(name) {
    const rec = this.state.hoods[name];
    return rec ? rec.box / 5 : 0;
  },
};
