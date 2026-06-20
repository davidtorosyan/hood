// Mode 2 — Neighborhood Card Battle.
// Fast A-vs-B (sometimes A-vs-B-vs-…) comparisons, each followed by a short
// explanation that teaches the relationship. No score, no streak — just reps.
import { el, clear, shuffle, sample, pickOne } from '../ui/dom.js';
import { modeScreen } from '../ui/chrome.js';
import { regionPhrase, areAdjacent } from '../relate.js';
import { distanceBetween } from '../geo.js';
import { NEIGHBORHOODS, BY_NAME, CARD_NAMES } from '../data/neighborhoods.js';

const REFS = [
  { label: 'Downtown', name: 'Downtown' },
  { label: 'Griffith Park', name: 'Griffith Park' },
  { label: 'the coast', name: 'Venice' },
  { label: 'the Port of LA', name: 'San Pedro' },
];

const opt = (label, correct) => ({ label, correct });

// Each generator returns { prompt, options:[{label,correct}], explain } or null.
const GENERATORS = [
  function regionMore() {
    const a = pickOne(NEIGHBORHOODS);
    const bPool = NEIGHBORHOODS.filter((n) => n.region !== a.region);
    if (!bPool.length) return null;
    const b = pickOne(bPool);
    return {
      prompt: `Which is more ${regionPhrase(a.region)}: ${a.name} or ${b.name}?`,
      options: shuffle([opt(a.name, true), opt(b.name, false)]),
      explain: `${a.name} is in ${a.region}, near ${a.nearby.slice(0, 3).join(', ')}. ${b.name} is over in ${b.region}.`,
    };
  },

  function closerTo() {
    const ref = pickOne(REFS);
    for (let t = 0; t < 25; t++) {
      const [a, b] = sample(CARD_NAMES.filter((n) => n !== ref.name), 2);
      const da = distanceBetween(a, ref.name);
      const db = distanceBetween(b, ref.name);
      if (!isFinite(da) || !isFinite(db) || Math.abs(da - db) < 5) continue;
      const closer = da < db ? a : b;
      const farther = da < db ? b : a;
      return {
        prompt: `Which is closer to ${ref.label}: ${a} or ${b}?`,
        options: shuffle([opt(a, a === closer), opt(b, b === closer)]),
        explain: `${closer} (${BY_NAME[closer].region}) is nearer ${ref.label}; ${farther} is in ${BY_NAME[farther].region}, farther off.`,
      };
    }
    return null;
  },

  function relatedPair() {
    const x = pickOne(NEIGHBORHOODS.filter((n) => n.nearby.some((m) => BY_NAME[m])));
    if (!x) return null;
    const near = pickOne(x.nearby.filter((m) => BY_NAME[m]));
    const farPool = CARD_NAMES.filter((m) => m !== x.name && !areAdjacent(m, x.name) && BY_NAME[m].region !== x.region);
    if (!farPool.length) return null;
    const far = pickOne(farPool);
    return {
      prompt: 'Which pair actually goes together?',
      options: shuffle([opt(`${x.name} + ${near}`, true), opt(`${x.name} + ${far}`, false)]),
      explain: `${x.name} and ${near} are neighbors in ${x.region}. ${far} is across town in ${BY_NAME[far].region}.`,
    };
  },

  function anchorAssoc() {
    const x = pickOne(NEIGHBORHOODS.filter((n) => n.anchors.length));
    const y = pickOne(NEIGHBORHOODS.filter((n) => n.name !== x.name));
    const anchor = x.anchors[0];
    return {
      prompt: `Which neighborhood is known for ${anchor}?`,
      options: shuffle([opt(x.name, true), opt(y.name, false)]),
      explain: `${anchor} anchors ${x.name} (${x.region}).`,
    };
  },

  function oddOneOut() {
    const clusters = {};
    for (const n of NEIGHBORHOODS) (clusters[n.cluster] ??= []).push(n);
    const big = Object.entries(clusters).filter(([, v]) => v.length >= 3);
    if (!big.length) return null;
    const [cid, members] = pickOne(big);
    const three = sample(members, 3);
    const outsider = pickOne(NEIGHBORHOODS.filter((n) => n.cluster !== cid));
    return {
      prompt: "Which one doesn't belong with the others?",
      options: shuffle([...three.map((n) => opt(n.name, false)), opt(outsider.name, true)]),
      explain: `${three.map((n) => n.name).join(', ')} are all in the ${three[0].region} cluster; ${outsider.name} is from ${outsider.region}.`,
    };
  },
];

function nextQuestion(lastPrompt) {
  for (let t = 0; t < 40; t++) {
    const q = pickOne(GENERATORS)();
    if (q && q.prompt !== lastPrompt) return q;
  }
  return GENERATORS[0]();
}

export function mountBattle(app, { back }) {
  let round = 0;
  let lastPrompt = null;

  function render() {
    const q = nextQuestion(lastPrompt);
    lastPrompt = q.prompt;
    round += 1;

    const options = el('div', { class: 'battle-options' });
    const explainSlot = el('div', { class: 'explain-slot' });

    for (const o of q.options) {
      options.append(
        el('button', {
          class: 'battle-option',
          onClick: (e) => {
            options.querySelectorAll('.battle-option').forEach((b, idx) => {
              b.disabled = true;
              if (q.options[idx].correct) b.classList.add('opt-correct');
            });
            if (!o.correct) e.currentTarget.classList.add('opt-wrong');
            explainSlot.append(
              el('div', { class: 'explain' }, [
                el('p', { class: 'explain-text' }, q.explain),
                el('button', { class: 'btn', onClick: render }, 'Next'),
              ]),
            );
            explainSlot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          },
        }, o.label),
      );
    }

    const body = [
      el('p', { class: 'battle-prompt' }, q.prompt),
      options,
      explainSlot,
    ];
    clear(app);
    app.append(modeScreen('Card Battle', back, body, { note: `#${round}`, bodyClass: 'scroll' }));
  }

  render();
}
