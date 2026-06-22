// Shared screen chrome: a top bar with a back button and an optional note,
// plus a standard screen wrapper. Kept tiny — the Jigsaw is the whole app.
import { el } from './dom.js';

export function topBar(title, onBack, note) {
  return el('div', { class: 'topbar' }, [
    el('button', { class: 'icon-btn', onClick: onBack, 'aria-label': 'Back' }, '←'),
    el('span', { class: 'topbar-title' }, title),
    note ? el('span', { class: 'topbar-note' }, note) : null,
  ]);
}

// A screen: fixed top bar, then body. `bodyClass` lets the body tune its layout.
export function screen(title, onBack, body, { note, bodyClass = '' } = {}) {
  return el('div', { class: 'screen' }, [
    topBar(title, onBack, note),
    el('div', { class: `screen-body ${bodyClass}` }, body),
  ]);
}
