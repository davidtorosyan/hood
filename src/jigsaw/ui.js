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

// The status banner. On the LEFT, one ACTION button that stays put and swaps its
// label/behaviour: "Scramble" on a solved board, "Solve" while assembling. Then
// the hint, then the up control and a pieces-left counter. (Scramble is an
// explicit button because the shake gesture proved undiscoverable in playtests;
// shaking still works as a bonus.)
export function statusBanner({ onUp, onSolve, onScramble }) {
  const hint = el('span', { class: 'jig-hint' }, '');
  const counter = el('span', { class: 'jig-count' }, '');

  let mode = 'scramble';
  const actionBtn = el('button', {
    class: 'jig-btn jig-action jig-scramble',
    onClick: () => (mode === 'solve' ? onSolve() : onScramble()),
  }, '🔀 Scramble');

  const banner = el('div', { class: 'jig-banner' }, [
    actionBtn,
    hint,
    el('div', { class: 'jig-banner-right' }, [
      el('button', { class: 'jig-btn jig-up', onClick: onUp, title: 'Zoom out one level', 'aria-label': 'Zoom out' }, '↑'),
      counter,
    ]),
  ]);

  return {
    banner,
    setHint: (t) => (hint.textContent = t),
    // mode: 'scramble' (solved board) or 'solve' (assembling). Same button.
    setAction: (m) => {
      mode = m;
      actionBtn.textContent = m === 'solve' ? 'Solve' : '🔀 Scramble';
      actionBtn.classList.toggle('jig-scramble', m === 'scramble');
      actionBtn.title = m === 'solve' ? 'Snap the pieces back together' : 'Break the map apart to play';
    },
    setCounter: (remaining) => {
      counter.textContent = remaining > 0 ? `${remaining} left` : '';
    },
    // `showTip` = the player has solved a puzzle before, so cue the next step.
    // Kept short so it never wraps to a second line.
    setSolved: (zoomable, showTip) => {
      counter.textContent = '';
      hint.textContent = !showTip ? '' : zoomable ? '👆 Tap to zoom in' : '👆 Tap for its card';
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
