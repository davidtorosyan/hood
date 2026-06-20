import './style.css';
import { el, clear } from './ui/dom.js';
import { mountMystery } from './modes/mystery.js';
import { mountBattle } from './modes/battle.js';
import { mountCluster } from './modes/cluster.js';
import { mountJigsaw } from './modes/jigsaw.js';
import { mountBrowse } from './modes/browse.js';

const app = document.querySelector('#app');
const goHome = () => renderHome();

function modeCard(emoji, title, desc, onClick, variant = '') {
  return el('button', { class: `mode-card ${variant}`, onClick }, [
    el('span', { class: 'mode-emoji' }, emoji),
    el('span', { class: 'mode-text' }, [
      el('span', { class: 'mode-title' }, title),
      el('span', { class: 'mode-desc' }, desc),
    ]),
    el('span', { class: 'mode-arrow' }, '›'),
  ]);
}

function renderHome() {
  clear(app);
  app.append(
    el('div', { class: 'screen home' }, [
      el('div', { class: 'home-top' }, [
        el('h1', { class: 'home-title' }, 'Hood'),
        el('p', { class: 'home-tag' }, 'Get to know the neighborhoods of LA.'),
      ]),
      el('div', { class: 'mode-list' }, [
        modeCard(
          '🧩',
          'Jigsaw',
          'Drag neighborhoods into place. Start here.',
          () => mountJigsaw(app, { back: goHome }),
        ),
        modeCard(
          '⚡',
          'Card Battle',
          'Fast comparisons. Build your instincts.',
          () => mountBattle(app, { back: goHome }),
        ),
        modeCard(
          '🕵️',
          'Daily Mystery',
          'Guess the neighborhood from clues.',
          () => mountMystery(app, { back: goHome }),
        ),
        modeCard(
          '🔗',
          'Build the Cluster',
          'Learn what sits near what.',
          () => mountCluster(app, { back: goHome }),
        ),
        modeCard(
          '📇',
          'Browse cards',
          'Flip through every neighborhood.',
          () => mountBrowse(app, { back: goHome }),
          'ghost',
        ),
      ]),
    ]),
  );
}

renderHome();
