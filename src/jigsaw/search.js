// A search overlay: type a place or region, get live autocomplete (each result
// shows where it sits), pick one to fly there. Pure UI — it calls back with the chosen item and the
// caller decides where to navigate.
import { el } from '../ui/dom.js';
import { SEARCH_ITEMS } from './tree.js';

const MAX_RESULTS = 8;

// Rank matches: exact label, then prefix, then substring; ties broken by the
// shorter (more specific) name. Regions float up a little so "san gabriel"
// surfaces the region before its many member areas.
function rank(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const it of SEARCH_ITEMS) {
    const l = it.label.toLowerCase();
    const idx = l.indexOf(q);
    if (idx === -1) continue;
    const tier = l === q ? 0 : idx === 0 ? 1 : 2;
    const kindBias = it.kind === 'region' ? -0.5 : 0;
    scored.push({ it, score: tier + kindBias + it.label.length / 100 });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, MAX_RESULTS).map((s) => s.it);
}

export function openSearch({ onPick }) {
  const input = el('input', {
    class: 'search-input',
    type: 'search',
    placeholder: 'Search a place or region…',
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    'aria-label': 'Search a place or region',
  });
  const list = el('div', { class: 'search-results', role: 'list', 'aria-live': 'polite' });

  const opener = document.activeElement;
  // `restore`: hand focus back to the opener (dismissed). Not after a pick —
  // the Enter that picked would then land on the Search button and reopen it.
  function close(restore = true) {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (restore && opener?.isConnected) opener.focus?.();
  }
  function pick(it) {
    close(false);
    onPick(it);
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'Enter' && document.activeElement === input) {
      e.preventDefault();
      const first = rank(input.value)[0];
      if (first) pick(first);
    }
  }
  function render() {
    const results = rank(input.value);
    list.replaceChildren(
      ...results.map((it) =>
        el('button', { class: 'search-item', onClick: () => pick(it) }, [
          el('span', { class: 'search-item-text' }, [
            el('span', { class: 'search-item-name' }, it.label),
            // Where it sits, e.g. "Pasadena area · San Gabriel Valley" — the
            // nesting is part of what's being learned.
            it.within ? el('span', { class: 'search-item-path' }, it.within) : null,
          ]),
          // Tag the bigger containers; plain places need no badge.
          it.kind === 'place'
            ? null
            : el('span', { class: `search-tag tag-${it.kind}` }, it.kind === 'region' ? 'Region' : 'Area'),
        ]),
      ),
    );
    list.classList.toggle('has-results', results.length > 0);
  }

  const overlay = el(
    'div',
    {
      class: 'search-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Search',
      onClick: (e) => e.target === overlay && close(),
    },
    [
      el('div', { class: 'search-panel' }, [
        el('div', { class: 'search-bar' }, [
          el('span', { class: 'search-icon' }, '🔍'),
          input,
          el('button', { class: 'search-cancel', onClick: () => close() }, 'Cancel'),
        ]),
        list,
      ]),
    ],
  );

  input.addEventListener('input', render);
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  // Focus synchronously, still inside the tap gesture that opened the search, so
  // mobile browsers raise the keyboard (a deferred focus doesn't count as a user
  // gesture, and iOS then refuses to show it).
  input.focus();
}
