// Shared screen chrome: a top bar with a back button and an optional progress
// note, plus a standard mode screen wrapper with a scrollable body.
import { el } from './dom.js';

export function topBar(title, onBack, note) {
  return el('div', { class: 'topbar' }, [
    el('button', { class: 'icon-btn', onClick: onBack, 'aria-label': 'Back' }, '←'),
    el('span', { class: 'topbar-title' }, title),
    note ? el('span', { class: 'topbar-note' }, note) : null,
  ]);
}

// A mode screen: fixed top bar, scrollable body. `bodyClass` lets a mode tune
// its body layout (e.g. center content).
export function modeScreen(title, onBack, body, { note, bodyClass = '' } = {}) {
  return el('div', { class: 'screen mode' }, [
    topBar(title, onBack, note),
    el('div', { class: `mode-body ${bodyClass}` }, body),
  ]);
}
