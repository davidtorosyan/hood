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

// The controls beside the stats line: "Solve" while a puzzle is on, and "↑ Zoom
// out" whenever there's a level above — even mid-puzzle (the puzzle is saved and
// picks up where you left off). Both disable mid-animation. On the county there's
// no Zoom out (⌂ goes home).
export function actionButton({ onUp, onSolve, isRoot }) {
  const solve = el('button', { class: 'jig-btn jig-topbtn jig-solve', onClick: () => onSolve() }, 'Solve');
  solve.title = 'Snap the rest into place';
  const up = el('button', { class: 'jig-btn jig-topbtn jig-up', onClick: () => onUp() }, '↑ Zoom out');
  up.title = 'Zoom out one level';
  if (isRoot) up.style.display = 'none';
  // m: 'solve' (puzzle on) | 'up' (solved) | 'busy' (mid-animation)
  const setAction = (m) => {
    solve.disabled = up.disabled = m === 'busy';
    if (m !== 'busy') solve.style.display = m === 'solve' ? '' : 'none';
  };
  setAction('up');
  return { button: el('div', { class: 'jig-actions' }, [solve, up]), setAction };
}
