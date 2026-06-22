import './style.css';
import { el, clear } from './ui/dom.js';
import { mountJigsaw } from './jigsaw/index.js';

const app = document.querySelector('#app');

function renderHome() {
  clear(app);
  app.append(
    el('div', { class: 'screen home' }, [
      el('div', { class: 'home-top' }, [
        el('h1', { class: 'home-title' }, 'Hood'),
        el('p', { class: 'home-tag' }, 'Get to know the neighborhoods of LA — piece by piece.'),
      ]),
      el('div', { class: 'home-art' }, '🧩'),
      el('button', { class: 'btn home-play', onClick: () => mountJigsaw(app, { back: renderHome }) }, 'Play'),
      el('p', { class: 'home-note' }, 'Drag the pieces together, then tap one to zoom in.'),
    ]),
  );
}

renderHome();
