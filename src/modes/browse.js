// Browse / reference — flip through every learning card, grouped by region.
// A place to inspect the teaching content directly.
import { el, clear } from '../ui/dom.js';
import { modeScreen } from '../ui/chrome.js';
import { learningCard } from '../ui/card.js';
import { NEIGHBORHOODS, BY_NAME, REGIONS } from '../data/neighborhoods.js';

export function mountBrowse(app, { back }) {
  function renderList() {
    const sections = [];
    for (const region of REGIONS) {
      const inRegion = NEIGHBORHOODS.filter((n) => n.region === region);
      if (!inRegion.length) continue;
      sections.push(
        el('div', { class: 'browse-section' }, [
          el('h3', { class: 'browse-region' }, region),
          el(
            'div',
            { class: 'browse-rows' },
            inRegion.map((n) =>
              el('button', { class: 'browse-row', onClick: () => renderDetail(n.name) }, [
                el('span', { class: 'browse-row-name' }, n.name),
                el('span', { class: 'browse-row-hook' }, n.hook),
                el('span', { class: 'mode-arrow' }, '›'),
              ]),
            ),
          ),
        ]),
      );
    }
    clear(app);
    app.append(
      modeScreen('Browse', back, [el('p', { class: 'mode-intro' }, `${NEIGHBORHOODS.length} neighborhoods`), ...sections], {
        bodyClass: 'scroll',
      }),
    );
  }

  function renderDetail(name) {
    clear(app);
    app.append(modeScreen('Browse', renderList, [learningCard(BY_NAME[name])], { bodyClass: 'scroll' }));
  }

  renderList();
}
