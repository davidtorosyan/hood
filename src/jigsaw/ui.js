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

// The status banner: a hint, a Solve shortcut (shown only while there's a
// scramble to solve), the up control, and a pieces-left counter. There's no
// Jumble button — you scramble a solved map by grabbing and shaking it.
export function statusBanner({ onUp, onSolve }) {
  const hint = el('span', { class: 'jig-hint' }, '');
  const counter = el('span', { class: 'jig-count' }, '');

  const solveBtn = el('button', { class: 'jig-btn jig-solve', onClick: onSolve, title: 'Snap the pieces back together' }, 'Solve');

  const banner = el('div', { class: 'jig-banner' }, [
    hint,
    el('div', { class: 'jig-banner-right' }, [
      solveBtn,
      el('button', { class: 'jig-btn jig-up', onClick: onUp, title: 'Zoom out one level', 'aria-label': 'Zoom out' }, '↑'),
      counter,
    ]),
  ]);

  return {
    banner,
    setHint: (t) => (hint.textContent = t),
    // Solve is only shown when there's actually something to solve.
    setControls: (canSolve) => {
      solveBtn.style.display = canSolve ? '' : 'none';
    },
    setCounter: (remaining) => {
      if (remaining > 0) banner.classList.remove('done');
      counter.textContent = remaining === 0 ? 'Done!' : `${remaining} left`;
    },
    setSolved: (zoomable) => {
      banner.classList.add('done');
      counter.textContent = 'Done!';
      hint.textContent = zoomable
        ? '👆 Tap to zoom in · 🤙 shake to scramble'
        : '👆 Tap for info · 🤙 shake to scramble';
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
