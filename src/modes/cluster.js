// Mode 3 — Build the Cluster.
// Reason about a small set of related neighborhoods (no big map). First cluster:
// Northeast LA. Teaches topology: what's near what, what belongs, what's confused.
import { el, clear, shuffle, sample, pickOne } from '../ui/dom.js';
import { modeScreen } from '../ui/chrome.js';
import { NEIGHBORHOODS, BY_NAME, neighborhoodsInCluster } from '../data/neighborhoods.js';

const CLUSTER_ID = 'nela';
const CLUSTER_LABEL = 'Northeast LA';

// Which side of NELA a neighborhood reads as — used for the orientation question.
const SIDES = {
  'Pasadena / Eagle Rock side': ['Eagle Rock', 'Highland Park', 'Mount Washington', 'El Sereno'],
  'Glendale / river side': ['Atwater Village', 'Glassell Park', 'Cypress Park', 'Lincoln Heights'],
};
const sideOf = (name) => Object.keys(SIDES).find((s) => SIDES[s].includes(name));

const opt = (label, correct) => ({ label, correct });

export function mountCluster(app, { back }) {
  const members = neighborhoodsInCluster(CLUSTER_ID);
  const names = members.map((m) => m.name);

  const GENERATORS = [
    function membership() {
      const inside = sample(names, 3);
      const outsider = pickOne(NEIGHBORHOODS.filter((n) => n.cluster !== CLUSTER_ID));
      return {
        prompt: `Which of these is NOT part of ${CLUSTER_LABEL}?`,
        options: shuffle([...inside.map((n) => opt(n, false)), opt(outsider.name, true)]),
        explain: `${inside.join(', ')} are all ${CLUSTER_LABEL}. ${outsider.name} belongs to ${outsider.region}.`,
      };
    },

    function between() {
      const x = pickOne(members.filter((m) => m.nearby.filter((y) => names.includes(y)).length >= 2));
      if (!x) return null;
      const [a, b] = sample(x.nearby.filter((y) => names.includes(y)), 2);
      const distractors = sample(names.filter((n) => ![x.name, a, b].includes(n)), 2);
      return {
        prompt: `Which neighborhood sits closest to both ${a} and ${b}?`,
        options: shuffle([opt(x.name, true), ...distractors.map((n) => opt(n, false))]),
        explain: `${x.name} borders both ${a} and ${b} within ${CLUSTER_LABEL}.`,
      };
    },

    function side() {
      const x = pickOne(members.filter((m) => sideOf(m.name)));
      if (!x) return null;
      const answer = sideOf(x.name);
      return {
        prompt: `Is ${x.name} more the Pasadena/Eagle Rock side of ${CLUSTER_LABEL}, or the Glendale/river side?`,
        options: Object.keys(SIDES).map((s) => opt(s, s === answer)),
        explain: `${x.name} reads as the ${answer.toLowerCase()} — near ${x.nearby.slice(0, 3).join(', ')}.`,
      };
    },
  ];

  let round = 0;
  let lastPrompt = null;

  function next() {
    for (let t = 0; t < 40; t++) {
      const q = pickOne(GENERATORS)();
      if (q && q.prompt !== lastPrompt) return q;
    }
    return GENERATORS[0]();
  }

  function render() {
    const q = next();
    lastPrompt = q.prompt;
    round += 1;

    const clusterStrip = el(
      'div',
      { class: 'cluster-strip' },
      [el('span', { class: 'cluster-strip-label' }, `${CLUSTER_LABEL}:`), ...names.map((n) => el('span', { class: 'chip chip-sm' }, n))],
    );

    const options = el('div', { class: 'mcq-options' });
    const explainSlot = el('div', { class: 'explain-slot' });
    for (const o of q.options) {
      options.append(
        el('button', {
          class: 'choice',
          onClick: (e) => {
            options.querySelectorAll('.choice').forEach((b, idx) => {
              b.disabled = true;
              if (q.options[idx].correct) b.classList.add('choice-correct');
            });
            if (!o.correct) e.currentTarget.classList.add('choice-wrong');
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
      clusterStrip,
      el('p', { class: 'mcq-prompt cluster-q' }, q.prompt),
      options,
      explainSlot,
    ];
    clear(app);
    app.append(modeScreen('Build the Cluster', back, body, { note: `#${round}`, bodyClass: 'scroll' }));
  }

  render();
}
