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

// The status banner. Returns the element plus handles the host updates through:
//   setHint(text), setCounter(remaining), setSolved(zoomable)
// and reads back the live skip-intro checkbox via getSkip()/onSkipToggle.
export function statusBanner({ onUp, onSolve, skip, onSkipToggle }) {
  const hint = el('span', { class: 'jig-hint' }, '');
  const counter = el('span', { class: 'jig-count' }, '');

  const skipBox = el('input', {
    type: 'checkbox',
    onChange: (e) => onSkipToggle(e.currentTarget.checked),
  });
  skipBox.checked = skip;

  const banner = el('div', { class: 'jig-banner' }, [
    hint,
    el('div', { class: 'jig-banner-right' }, [
      el('label', { class: 'jig-skip', title: 'Debug: skip the explode intro' }, [skipBox, 'skip']),
      el('button', { class: 'jig-up', onClick: onUp, title: 'Zoom out' }, '↑ up'),
      el('button', { class: 'jig-debug', onClick: onSolve, title: 'Debug: auto-solve' }, 'Solve'),
      counter,
    ]),
  ]);

  return {
    banner,
    setHint: (t) => (hint.textContent = t),
    setCounter: (remaining) => {
      counter.textContent = remaining === 0 ? 'Done!' : `${remaining} left`;
    },
    setSolved: (zoomable) => {
      banner.classList.add('done');
      counter.textContent = 'Done!';
      hint.textContent = zoomable ? '👆 Tap a piece to zoom in' : 'Solved!';
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
