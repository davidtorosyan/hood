// Presentational chrome around a Board: the breadcrumb (where you are in the
// nesting, each level tappable) and the Solve / Zoom out button. No game logic.
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

// One small button beside the stats line that swaps with state: "Solve" while
// assembling (snap the rest into place), "Zoom out" once the map is solved.
// Hidden on a solved county map — the ⌂ button covers going home.
export function actionButton({ onUp, onSolve, isRoot }) {
  let mode = 'up';
  const button = el('button', {
    class: 'jig-btn jig-topbtn',
    onClick: () => (mode === 'solve' ? onSolve() : onUp()),
  });
  const setAction = (m) => {
    mode = m;
    const solving = m === 'solve';
    button.textContent = solving ? 'Solve' : '↑ Zoom out';
    button.title = solving ? 'Snap the rest into place' : 'Zoom out one level';
    button.style.visibility = !solving && isRoot ? 'hidden' : '';
  };
  setAction('up');
  return { button, setAction };
}
