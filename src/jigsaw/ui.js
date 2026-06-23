// Presentational chrome around a Board: the breadcrumb (where you are in the
// nesting, each level tappable), the status banner (hint + debug controls +
// pieces-left counter), and a transient toast over the board. No game logic.
import { el } from '../ui/dom.js';
import { pathIds, labelOf } from './tree.js';

// LA › region › group … — the last crumb is the current node (not a link).
export function breadcrumb(nodeId, onNavigate) {
  const crumbs = pathIds(nodeId);
  return el(
    'div',
    { class: 'jig-crumbs' },
    crumbs.flatMap((id, i) => {
      const last = i === crumbs.length - 1;
      const seg = el(
        'button',
        { class: `jig-crumb${last ? ' current' : ''}`, onClick: last ? null : () => onNavigate(id) },
        labelOf(id),
      );
      return last ? [seg] : [seg, el('span', { class: 'jig-crumb-sep' }, '›')];
    }),
  );
}

// The status banner: a hint, the primary action (Scramble when solved, Solve
// while assembling — they swap), the up control, and a pieces-left counter.
// Scramble is an explicit button because the shake gesture proved undiscoverable
// in playtesting (people shook the phone); shaking still works as a bonus.
export function statusBanner({ onUp, onSolve, onScramble }) {
  const hint = el('span', { class: 'jig-hint' }, '');
  const counter = el('span', { class: 'jig-count' }, '');

  const scrambleBtn = el('button', { class: 'jig-btn jig-scramble', onClick: onScramble, title: 'Break the map apart to play' }, '🔀 Scramble');
  const solveBtn = el('button', { class: 'jig-btn jig-solve', onClick: onSolve, title: 'Snap the pieces back together' }, 'Solve');

  const banner = el('div', { class: 'jig-banner' }, [
    hint,
    el('div', { class: 'jig-banner-right' }, [
      scrambleBtn,
      solveBtn,
      el('button', { class: 'jig-btn jig-up', onClick: onUp, title: 'Zoom out one level', 'aria-label': 'Zoom out' }, '↑'),
      counter,
    ]),
  ]);

  return {
    banner,
    setHint: (t) => (hint.textContent = t),
    // Scramble shows on a solved board, Solve while assembling — never both.
    setControls: (canSolve, canScramble) => {
      solveBtn.style.display = canSolve ? '' : 'none';
      scrambleBtn.style.display = canScramble ? '' : 'none';
    },
    setCounter: (remaining) => {
      // No "Done!" badge (it read like a button); just the pieces-left count.
      counter.textContent = remaining > 0 ? `${remaining} left` : '';
    },
    setSolved: (zoomable) => {
      counter.textContent = '';
      hint.textContent = zoomable ? '👆 Tap a piece to zoom in' : '👆 Tap a neighborhood for info';
    },
  };
}

// A transient cue floating over the board; doesn't reflow it, lets taps through.
export function showToast(boardWrap, msg) {
  const t = el('div', { class: 'jig-toast' }, msg);
  boardWrap.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2600);
}
