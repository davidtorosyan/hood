// Session orchestrator: builds a queue of rounds, runs the two round types
// ("where is it?" pin + "what is it?" multiple choice), scores, and reveals.
import { NEIGHBORHOODS_BY_NAME, REGIONS } from './data/neighborhoods.js';
import { createMap, distanceKm, isInside, centroidOf } from './map.js';
import { store } from './store.js';

const ROUNDS = 10;
const MAX_REQUEUE = 5;
const SIZE_LABEL = { S: 'Small', M: 'Medium', L: 'Large' };

// Tiny DOM helper.
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) node.append(c);
  return node;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function scoreWhere(name, lngLat) {
  if (isInside(name, lngLat)) return { pts: 100, label: 'Nailed it', tone: 'good', success: true };
  const km = distanceKm(name, lngLat);
  if (km < 3) return { pts: 60, label: 'So close', tone: 'good', success: true };
  if (km < 7) return { pts: 30, label: `${km.toFixed(1)} km off`, tone: 'mid', success: false };
  return { pts: 0, label: `${km.toFixed(1)} km off`, tone: 'bad', success: false };
}

export function startGame(root, onExit) {
  const pool = Object.keys(NEIGHBORHOODS_BY_NAME);
  const picks = store.pickSession(pool, ROUNDS);
  const queue = picks.map((name, i) => ({ name, type: i % 2 === 0 ? 'where' : 'what' }));
  const requeued = new Set();

  let index = 0;
  let score = 0;
  let streak = 0;
  let bestStreak = 0;
  let answering = false;

  // ---- Layout ---------------------------------------------------------------
  const roundLabel = el('span', { class: 'stat-round' });
  const scoreLabel = el('span', { class: 'stat-val' }, '0');
  const streakLabel = el('span', { class: 'stat-val' }, '0');
  const progressFill = el('div', { class: 'progress-fill' });

  const topbar = el('div', { class: 'topbar' }, [
    el('button', { class: 'icon-btn', onClick: () => onExit(), 'aria-label': 'Quit' }, '←'),
    roundLabel,
    el('div', { class: 'stats' }, [
      el('div', { class: 'stat' }, [el('span', { class: 'stat-key' }, 'SCORE'), scoreLabel]),
      el('div', { class: 'stat' }, [el('span', { class: 'stat-key' }, 'STREAK'), streakLabel]),
    ]),
  ]);

  const mapWrap = el('div', { class: 'map-wrap' });
  const panel = el('div', { class: 'panel' });

  root.replaceChildren(
    el('div', { class: 'screen game' }, [
      topbar,
      el('div', { class: 'progress' }, [progressFill]),
      mapWrap,
      panel,
    ]),
  );

  const map = createMap(mapWrap);

  map.onTap((evt) => {
    if (!answering || queue[index].type !== 'where') return;
    answering = false;
    map.setTappable(false);
    const lngLat = map.eventToLngLat(evt);
    const round = queue[index];
    const result = scoreWhere(round.name, lngLat);
    map.addMarker(lngLat, 'pin-you');
    map.addMarker(centroidOf(round.name), 'pin-real');
    map.setHighlight(round.name, 'correct');
    finishRound(result);
  });

  // ---- Helpers --------------------------------------------------------------
  function updateHud() {
    roundLabel.textContent = `Round ${index + 1}`;
    scoreLabel.textContent = String(score);
    streakLabel.textContent = String(streak);
    progressFill.style.width = `${(index / queue.length) * 100}%`;
  }

  function distractors(name) {
    const n = NEIGHBORHOODS_BY_NAME[name];
    const others = pool.filter((p) => p !== name);
    const sameRegion = shuffle(others.filter((p) => NEIGHBORHOODS_BY_NAME[p].region === n.region));
    const rest = shuffle(others.filter((p) => NEIGHBORHOODS_BY_NAME[p].region !== n.region));
    return [...sameRegion, ...rest].slice(0, 3);
  }

  function finishRound(result) {
    score += result.pts;
    if (result.success) {
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      streak = 0;
    }
    store.record(queue[index].name, result.success);
    streakLabel.textContent = String(streak);
    scoreLabel.textContent = String(score);

    // Instant re-ask on a miss to lock it in (once per neighborhood, bounded).
    const name = queue[index].name;
    if (!result.success && !requeued.has(name) && requeued.size < MAX_REQUEUE) {
      requeued.add(name);
      const otherType = queue[index].type === 'where' ? 'what' : 'where';
      queue.splice(index + 2, 0, { name, type: otherType });
    }
    renderReveal(result);
  }

  // ---- Reveal card ----------------------------------------------------------
  function renderReveal(result) {
    const n = NEIGHBORHOODS_BY_NAME[queue[index].name];
    const isLast = index + 1 >= queue.length;
    panel.replaceChildren(
      el('div', { class: `reveal tone-${result.tone}` }, [
        el('div', { class: 'reveal-result' }, result.label),
        el('h2', { class: 'reveal-name' }, n.name),
        el('div', { class: 'reveal-meta' }, [
          el('span', { class: 'chip' }, n.region),
          el('span', { class: 'chip' }, `${SIZE_LABEL[n.size]} · ~${n.population.toLocaleString()}`),
        ]),
        el('p', { class: 'reveal-history' }, n.history),
        el('p', { class: 'reveal-landmark' }, [el('span', { class: 'pin-emoji' }, '📍 '), n.landmark]),
        el(
          'button',
          { class: 'btn btn-next', onClick: () => next() },
          isLast ? 'See results' : 'Next',
        ),
      ]),
    );
  }

  // ---- Round rendering ------------------------------------------------------
  function renderRound() {
    if (index >= queue.length) return renderResults();
    updateHud();
    map.clearState();
    const round = queue[index];
    const n = NEIGHBORHOODS_BY_NAME[round.name];
    answering = true;

    if (round.type === 'where') {
      map.setTappable(true);
      panel.replaceChildren(
        el('div', { class: 'prompt' }, [
          el('div', { class: 'prompt-kicker' }, 'Tap where it is'),
          el('h2', { class: 'prompt-name' }, n.name),
        ]),
      );
    } else {
      map.setTappable(false);
      map.dimAllExcept(round.name);
      map.setHighlight(round.name, 'target');
      const options = shuffle([round.name, ...distractors(round.name)]);
      panel.replaceChildren(
        el('div', { class: 'prompt' }, [
          el('div', { class: 'prompt-kicker' }, 'Which neighborhood is highlighted?'),
        ]),
        el(
          'div',
          { class: 'choices' },
          options.map((opt) =>
            el(
              'button',
              {
                class: 'choice',
                onClick: (e) => {
                  if (!answering) return;
                  answering = false;
                  const correct = opt === round.name;
                  e.currentTarget.classList.add(correct ? 'choice-correct' : 'choice-wrong');
                  if (!correct) {
                    [...panel.querySelectorAll('.choice')]
                      .find((b) => b.textContent === round.name)
                      ?.classList.add('choice-correct');
                  }
                  map.setHighlight(round.name, 'correct');
                  finishRound(
                    correct
                      ? { pts: 100, label: 'Correct', tone: 'good', success: true }
                      : { pts: 0, label: 'Not quite', tone: 'bad', success: false },
                  );
                },
              },
              opt,
            ),
          ),
        ),
      );
    }
  }

  function next() {
    index += 1;
    renderRound();
  }

  // ---- Results --------------------------------------------------------------
  function renderResults() {
    progressFill.style.width = '100%';
    store.endSession(bestStreak);
    const max = queue.length * 100;
    panel.replaceChildren();
    mapWrap.replaceChildren();
    root.querySelector('.screen').replaceChildren(
      el('div', { class: 'results' }, [
        el('div', { class: 'results-emoji' }, score >= max * 0.7 ? '🏆' : '🗺️'),
        el('h1', {}, 'Session complete'),
        el('div', { class: 'results-score' }, [
          el('span', { class: 'big' }, String(score)),
          el('span', { class: 'small' }, `/ ${max}`),
        ]),
        el('p', { class: 'results-sub' }, `Best streak: ${bestStreak}`),
        el('div', { class: 'results-actions' }, [
          el('button', { class: 'btn', onClick: () => startGame(root, onExit) }, 'Play again'),
          el('button', { class: 'btn btn-ghost', onClick: () => onExit() }, 'Home'),
        ]),
      ]),
    );
  }

  renderRound();
}
