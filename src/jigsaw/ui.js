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

// The status banner: a hint and ONE top-right button that swaps with state — it's
// "Solve" while you're assembling (snap the pieces together), and the "↑" zoom-out
// control once the map is solved. (Scramble lives in the tray; the shake gesture
// still works as a bonus.)
export function statusBanner({ onUp, onSolve }) {
  const hint = el('span', { class: 'jig-hint' }, '');

  let mode = 'scramble'; // 'solve' (assembling) → "Solve"; otherwise → "↑"
  const topBtn = el('button', {
    class: 'jig-btn jig-topbtn jig-up',
    onClick: () => (mode === 'solve' ? onSolve() : onUp()),
  }, '↑');

  const banner = el('div', { class: 'jig-banner' }, [hint, topBtn]);

  return {
    banner,
    setHint: (t) => (hint.textContent = t),
    // mode: 'solve' while assembling → the button is "Solve"; otherwise it's the
    // up/zoom-out control.
    setAction: (m) => {
      mode = m;
      const solving = m === 'solve';
      topBtn.textContent = solving ? 'Solve' : '↑';
      topBtn.classList.toggle('jig-solve', solving);
      topBtn.classList.toggle('jig-up', !solving);
      topBtn.title = solving ? 'Snap the pieces together' : 'Zoom out one level';
      topBtn.setAttribute('aria-label', solving ? 'Solve' : 'Zoom out');
    },
    // `showTip` = the player has solved a puzzle before, so cue the next step.
    // Kept short so it never wraps to a second line.
    setSolved: (zoomable, showTip) => {
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
