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

// One small button that rides the breadcrumb row and swaps with state: "Solve"
// while assembling (snap the pieces together), and the "↑" zoom-out control once
// the map is solved. (Scramble lives in the tray; the shake gesture still works.)
export function actionButton({ onUp, onSolve }) {
  let mode = 'scramble'; // 'solve' (assembling) → "Solve"; otherwise → "↑"
  const button = el('button', {
    class: 'jig-btn jig-topbtn jig-up',
    onClick: () => (mode === 'solve' ? onSolve() : onUp()),
  }, '↑');

  return {
    button,
    // mode: 'solve' while assembling → "Solve"; otherwise the up/zoom-out control.
    setAction: (m) => {
      mode = m;
      const solving = m === 'solve';
      button.textContent = solving ? 'Solve' : '↑';
      button.classList.toggle('jig-solve', solving);
      button.classList.toggle('jig-up', !solving);
      button.title = solving ? 'Snap the pieces together' : 'Zoom out one level';
      button.setAttribute('aria-label', solving ? 'Solve' : 'Zoom out');
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
