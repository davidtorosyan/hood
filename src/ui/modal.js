// A modal dialog over everything: backdrop, Escape / backdrop-tap to close, and
// the accessibility basics — role=dialog + aria-modal, focus moved into the
// dialog on open (synchronously, so a phone keyboard can rise for an input),
// Tab kept inside it, and focus handed back to whatever opened it on close.
import { el } from './dom.js';

// `card`: the dialog element. `focus`: the element to focus first (defaults to
// the dialog itself). Returns close().
export function openModal(card, { label, focus } = {}) {
  const opener = document.activeElement;
  const backdrop = el('div', { class: 'card-backdrop' });
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  if (label) card.setAttribute('aria-label', label);
  card.tabIndex = -1;

  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    backdrop.classList.remove('show');
    setTimeout(() => backdrop.remove(), 200);
    document.removeEventListener('keydown', onKey);
    if (opener?.isConnected) opener.focus?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') return close();
    if (e.key !== 'Tab') return;
    const items = [...card.querySelectorAll('button, a[href], input, textarea, [tabindex]:not([tabindex="-1"])')].filter(
      (n) => !n.disabled,
    );
    if (!items.length) return;
    const first = items[0];
    const last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  backdrop.append(card);
  backdrop.addEventListener('click', (e) => e.target === backdrop && close());
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  (focus || card).focus({ preventScroll: true });
  requestAnimationFrame(() => backdrop.classList.add('show'));
  return close;
}
