// Lightweight, privacy-friendly analytics (GoatCounter) + crash visibility + the
// context we attach to bug reports. Everything is gated on config, so it's a
// no-op until the codes below are filled in.
import { store } from './store.js';

// ---- Fill these in ---------------------------------------------------------
// GoatCounter: after signing up, this is your counter endpoint, e.g.
//   'https://myhood.goatcounter.com/count'
const GOATCOUNTER = 'https://jimbo84.goatcounter.com/count';
// A form endpoint that emails you the report (Formspree recommended), e.g.
//   'https://formspree.io/f/abcdwxyz'
const FORM_ENDPOINT = 'https://formspree.io/f/xqevnyeo';
// ----------------------------------------------------------------------------

const GITHUB_REPO = 'davidtorosyan/hood';
const VERSION = typeof __COMMIT__ === 'string' ? __COMMIT__ : 'dev';

let ready = false;

// Load the GoatCounter beacon (no cookies) and start counting crashes. Called
// once at startup.
export function initTelemetry() {
  if (GOATCOUNTER) {
    // Don't auto-count on load here — we do it explicitly so it also works if the
    // script loads late.
    window.goatcounter = { no_onload: true };
    const s = document.createElement('script');
    s.async = true;
    s.src = '//gc.zgo.at/count.js';
    s.setAttribute('data-goatcounter', GOATCOUNTER);
    s.addEventListener('load', () => {
      ready = true;
      window.goatcounter?.count?.(); // the single page view for this visit
    });
    document.head.appendChild(s);
  }
  // Crash visibility: count JS errors / rejected promises as events. Guard the
  // resource-load "error" events (they have no `.error`).
  window.addEventListener('error', (e) => e.error && countEvent('js-error'));
  window.addEventListener('unhandledrejection', () => countEvent('js-error'));
}

// Record a named event (a no-op until analytics is configured + loaded).
export function countEvent(name) {
  if (ready) window.goatcounter?.count?.({ path: name, title: name, event: true });
}

// The context we attach to a bug report — where they were and which build.
export function bugContext() {
  const nav = store.nav?.();
  const where = nav ? `${nav.node} · ${nav.board ? nav.board.phase : 'solved'}` : 'home';
  return {
    where,
    version: VERSION,
    size: `${window.innerWidth}×${window.innerHeight}`,
    url: location.href,
    ua: navigator.userAgent,
  };
}

export const reportConfig = { FORM_ENDPOINT, GITHUB_REPO };
