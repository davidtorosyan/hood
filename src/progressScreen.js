// The Progress screen: puzzles solved overall and per region (tap a region to
// jump in), and the trophy shelf — earned ones in colour, the rest greyed with
// what it takes (and how far along you are).
import { el, clear } from './ui/dom.js';
import { labelOf } from './jigsaw/tree.js';
import { store } from './store.js';
import { PUZZLES, REGIONS, TROPHIES, regionPuzzles, solvedIn } from './progress.js';

const bar = (n, of) =>
  el('div', { class: 'pg-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': of, 'aria-valuenow': n }, [
    el('div', { class: 'pg-bar-fill', style: `width:${of ? (100 * n) / of : 0}%` }),
  ]);

// onBack: back to home · onPlay(nodeId): jump into a region.
export function renderProgress(app, { onBack, onPlay }) {
  const solved = store.solvedCount();
  const have = store.trophies();
  const earned = TROPHIES.filter((t) => have[t.id]).length;

  clear(app);
  app.append(
    el('div', { class: 'screen' }, [
      el('div', { class: 'topbar' }, [
        el('button', { class: 'icon-btn', onClick: onBack, 'aria-label': 'Back' }, '←'),
        el('span', { class: 'topbar-title' }, 'Your progress'),
      ]),
      el('div', { class: 'screen-body pg-body' }, [
        el('section', { class: 'pg-hero' }, [
          el('div', { class: 'pg-big' }, [el('b', {}, `${solved}`), ` / ${PUZZLES.length}`]),
          el('div', { class: 'pg-sub' }, 'puzzles solved in Explore'),
          bar(solved, PUZZLES.length),
        ]),
        el('h2', { class: 'pg-h' }, 'Regions'),
        el(
          'div',
          { class: 'pg-regions' },
          REGIONS.map((r) => {
            const ids = regionPuzzles(r);
            const n = solvedIn(ids);
            return el('button', { class: `pg-region${n === ids.length ? ' done' : ''}`, onClick: () => onPlay(r) }, [
              el('span', { class: 'pg-region-name' }, labelOf(r)),
              el('span', { class: 'pg-region-count' }, n === ids.length ? `✓ ${n} / ${ids.length}` : `${n} / ${ids.length}`),
              bar(n, ids.length),
            ]);
          }),
        ),
        el('h2', { class: 'pg-h' }, `Trophies · ${earned} of ${TROPHIES.length}`),
        el(
          'div',
          { class: 'pg-trophies' },
          TROPHIES.map((t) => {
            const got = !!have[t.id];
            const prog = !got && t.progress ? t.progress() : null;
            return el('div', { class: `pg-trophy${got ? ' got' : ''}` }, [
              el('div', { class: 'pg-trophy-icon', 'aria-hidden': 'true' }, t.icon),
              el('div', { class: 'pg-trophy-name' }, t.name),
              el('div', { class: 'pg-trophy-desc' }, t.desc),
              prog && prog[0] > 0 ? el('div', { class: 'pg-trophy-prog' }, `${prog[0]} / ${prog[1]}`) : null,
            ]);
          }),
        ),
      ]),
    ]),
  );
}
