// Mode 1 — Daily Mystery Neighborhood.
// Teach-by-clue: reveal clues one at a time, guess any time, partial credit for
// near misses, then a learning card and two quick reinforcement questions.
import { el, clear, shuffle, sample, pickOne } from '../ui/dom.js';
import { modeScreen } from '../ui/chrome.js';
import { learningCard } from '../ui/card.js';
import { closeness, areAdjacent } from '../relate.js';
import { NEIGHBORHOODS, BY_NAME, CARD_NAMES, REGIONS } from '../data/neighborhoods.js';
import { store } from '../store.js';

const CLUE_LABELS = ['Region', 'Nearby', 'Anchors', 'Identity', 'Hook'];

function buildClues(n) {
  return [
    `It's in ${n.region}.`,
    `It's near ${n.nearby.slice(0, 4).join(', ')}.`,
    `Local anchors: ${n.anchors.join(', ')}.`,
    n.identity,
    `Mental hook: ${n.hook}`,
  ];
}

function dailyIndex(dateKey, len) {
  let h = 0;
  for (const c of dateKey) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % len;
}

export function mountMystery(app, { back }) {
  const dateKey = new Date().toISOString().slice(0, 10);
  let answer; // neighborhood object
  let cluesShown;
  let guesses;
  let best; // best closeness object seen

  function start(daily) {
    answer = daily
      ? NEIGHBORHOODS[dailyIndex(dateKey, NEIGHBORHOODS.length)]
      : pickOne(NEIGHBORHOODS);
    cluesShown = 1;
    guesses = [];
    best = null;
    renderRound(daily);
  }

  // ---- Round (clues + guessing) -------------------------------------------
  function renderRound(daily, feedback) {
    const clues = buildClues(answer);
    const cluesEl = el(
      'div',
      { class: 'clues' },
      clues.slice(0, cluesShown).map((text, i) =>
        el('div', { class: 'clue' }, [
          el('span', { class: 'clue-tag' }, CLUE_LABELS[i]),
          el('span', { class: 'clue-text' }, text),
        ]),
      ),
    );

    const input = el('input', {
      class: 'guess-input',
      placeholder: 'Guess a neighborhood…',
      autocomplete: 'off',
      autocapitalize: 'words',
    });
    const suggestions = el('div', { class: 'suggestions' });
    input.addEventListener('input', () => {
      clear(suggestions);
      const q = input.value.trim().toLowerCase();
      if (!q) return;
      for (const name of CARD_NAMES.filter((n) => n.toLowerCase().includes(q)).slice(0, 6)) {
        suggestions.append(el('button', { class: 'suggestion', onClick: () => submitGuess(name, daily) }, name));
      }
    });

    const allShown = cluesShown >= clues.length;
    const body = [
      el('p', { class: 'mode-intro' }, daily ? "Today's mystery neighborhood." : 'Mystery neighborhood.'),
      cluesEl,
      feedback ? el('div', { class: `feedback feedback-${feedback.level}` }, feedback.text) : null,
      el('div', { class: 'guess-wrap' }, [input, suggestions]),
      el('div', { class: 'round-actions' }, [
        el(
          'button',
          { class: 'btn btn-soft', onClick: () => revealNextClue(daily), disabled: allShown },
          allShown ? 'No more clues' : 'Reveal next clue',
        ),
        el('button', { class: 'link-btn', onClick: () => renderReveal(daily, false) }, 'Give up'),
      ]),
    ];
    clear(app);
    app.append(modeScreen('Daily Mystery', back, body, { note: `Clue ${cluesShown}/${clues.length}` }));
  }

  function revealNextClue(daily) {
    cluesShown = Math.min(cluesShown + 1, 5);
    renderRound(daily);
  }

  function submitGuess(name, daily) {
    const c = closeness(name, answer.name);
    guesses.push({ name, ...c });
    if (!best || rank(c.level) > rank(best.level)) best = c;
    if (c.level === 'exact') {
      renderReveal(daily, true);
      return;
    }
    const text = {
      adjacent: `${name} is right next door — but not it. Keep going.`,
      cluster: `${name} is in the same cluster. Close! Try again or take another clue.`,
      region: `Right region (${BY_NAME[name].region}), wrong neighborhood. Warmer.`,
      far: `${name} isn't close. Want another clue?`,
    }[c.level];
    renderRound(daily, { level: c.level, text });
  }

  // ---- Reveal + reinforcement ---------------------------------------------
  function renderReveal(daily, solved) {
    if (daily) store.setDaily(dateKey, { name: answer.name, solved, clues: cluesShown });
    store.markSeen(answer.name);

    let resultText;
    if (solved) resultText = `Solved in ${cluesShown} clue${cluesShown > 1 ? 's' : ''}!`;
    else if (best && best.level !== 'far') resultText = `It was ${answer.name}. Your closest guess was ${best.label.toLowerCase()}.`;
    else resultText = `It was ${answer.name}.`;

    const reinforceSlot = el('div', { class: 'reinforce-slot' });
    const body = [
      el('div', { class: `reveal-banner ${solved ? 'tone-good' : 'tone-neutral'}` }, resultText),
      learningCard(answer),
      reinforceSlot,
    ];
    clear(app);
    app.append(modeScreen('Daily Mystery', back, body, { bodyClass: 'scroll' }));
    runReinforcement(reinforceSlot, daily);
  }

  function runReinforcement(slot, daily) {
    const questions = [regionQuestion(answer), relationshipQuestion(answer)].filter(Boolean);
    let i = 0;
    const heading = el('h3', { class: 'reinforce-heading' }, 'Quick check');
    const qSlot = el('div', {});
    slot.append(heading, qSlot);
    showNext();

    function showNext() {
      if (i >= questions.length) {
        qSlot.append(
          el('div', { class: 'reinforce-done' }, [
            el('button', { class: 'btn', onClick: () => start(false) }, 'New mystery'),
            el('button', { class: 'btn btn-ghost', onClick: back }, 'Home'),
          ]),
        );
        return;
      }
      const q = questions[i];
      const card = el('div', { class: 'mcq' }, [el('p', { class: 'mcq-prompt' }, q.prompt)]);
      const opts = el('div', { class: 'mcq-options' });
      for (const opt of q.options) {
        opts.append(
          el('button', {
            class: 'choice',
            onClick: (e) => {
              const correct = opt === q.answer;
              e.currentTarget.classList.add(correct ? 'choice-correct' : 'choice-wrong');
              if (!correct) {
                [...opts.querySelectorAll('.choice')]
                  .find((b) => b.textContent === q.answer)
                  ?.classList.add('choice-correct');
              }
              opts.querySelectorAll('.choice').forEach((b) => (b.disabled = true));
              card.append(el('p', { class: 'mcq-note' }, q.note));
              card.append(
                el('button', { class: 'btn btn-soft mcq-next', onClick: () => { i += 1; showNext(); } }, 'Continue'),
              );
            },
          }, opt),
        );
      }
      card.append(opts);
      clear(qSlot);
      qSlot.append(card);
    }
  }

  start(true);
}

function rank(level) {
  return { far: 0, region: 1, cluster: 2, adjacent: 3, exact: 4 }[level];
}

function regionQuestion(n) {
  const others = sample(REGIONS.filter((r) => r !== n.region), 3);
  return {
    prompt: `Which region is ${n.name} in?`,
    options: shuffle([n.region, ...others]),
    answer: n.region,
    note: `${n.name} is in ${n.region}.`,
  };
}

function relationshipQuestion(n) {
  const near = n.nearby.find((x) => BY_NAME[x]);
  const farPool = CARD_NAMES.filter((x) => x !== n.name && !areAdjacent(x, n.name) && BY_NAME[x].region !== n.region);
  if (!near || farPool.length === 0) return null;
  const far = pickOne(farPool);
  return {
    prompt: `Which one is actually near ${n.name}?`,
    options: shuffle([near, far]),
    answer: near,
    note: `${near} is right by ${n.name}; ${far} is over in ${BY_NAME[far].region}.`,
  };
}
