// A search overlay: type a place or region, get live autocomplete, pick one to
// jump to its region. Pure UI — it calls back with the chosen item and the
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
  });
  const list = el('div', { class: 'search-results' });

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  function pick(it) {
    close();
    onPick(it);
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'Enter') {
      const first = rank(input.value)[0];
      if (first) pick(first);
    }
  }
  function render() {
    const results = rank(input.value);
    list.replaceChildren(
      ...results.map((it) =>
        el('button', { class: 'search-item', onClick: () => pick(it) }, [
          el('span', { class: 'search-item-name' }, it.label),
          el(
            'span',
            { class: `search-tag tag-${it.kind}` },
            it.kind === 'region' ? 'Region' : it.regionLabel,
          ),
        ]),
      ),
    );
    list.classList.toggle('has-results', results.length > 0);
  }

  const overlay = el(
    'div',
    { class: 'search-overlay', onClick: (e) => e.target === overlay && close() },
    [
      el('div', { class: 'search-panel' }, [
        el('div', { class: 'search-bar' }, [
          el('span', { class: 'search-icon' }, '🔍'),
          input,
          el('button', { class: 'search-cancel', onClick: close }, 'Cancel'),
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
