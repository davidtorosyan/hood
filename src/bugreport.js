// The "Report an issue" dialog: a short description box and an optional return
// email, sent to a form that emails us. A bit of context (where you were, which
// build, browser) is attached automatically. Folks who'd rather just email can
// use the support address at the bottom.
import { el } from './ui/dom.js';
import { openModal } from './ui/modal.js';
import { bugContext, countEvent, reportConfig } from './telemetry.js';

export function openBugReport() {
  countEvent('bug-open');
  const ctx = bugContext();

  const input = el('textarea', {
    class: 'bug-input',
    rows: '4',
    placeholder: 'What happened? What did you expect? Steps if you have them.',
    'aria-label': 'What happened',
  });
  const email = el('input', {
    class: 'bug-email',
    type: 'email',
    placeholder: 'Your email (optional — if you’d like a reply)',
    'aria-label': 'Your email (optional)',
  });
  const status = el('div', { class: 'bug-status', role: 'status' }, '');

  let close = () => {};

  const sendBtn = el(
    'button',
    {
      class: 'jig-btn bug-action bug-send',
      onClick: async () => {
        if (!reportConfig.FORM_ENDPOINT) {
          status.textContent = `Please email ${reportConfig.SUPPORT_EMAIL} instead.`;
          return;
        }
        if (!input.value.trim()) {
          status.textContent = 'Add a quick description first.';
          return;
        }
        sendBtn.disabled = true;
        status.textContent = 'Sending…';
        try {
          const res = await fetch(reportConfig.FORM_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              message: input.value.trim(),
              email: email.value.trim() || undefined,
              _replyto: email.value.trim() || undefined,
              ...ctx,
            }),
          });
          if (!res.ok) throw new Error('bad status');
          countEvent('bug-sent');
          status.textContent = 'Thanks — sent! 🙌';
          setTimeout(close, 1200);
        } catch {
          sendBtn.disabled = false;
          status.textContent = `Couldn’t send — please email ${reportConfig.SUPPORT_EMAIL}.`;
        }
      },
    },
    'Send',
  );

  const card = el('div', { class: 'card bug-card' }, [
    el('button', { class: 'card-close', onClick: () => close(), 'aria-label': 'Close' }, '✕'),
    el('h2', { class: 'card-name bug-title' }, 'Report an issue'),
    el('p', { class: 'bug-note' }, 'Tell us what went wrong. We attach where you were in the game, the build, your screen size and browser.'),
    input,
    email,
    status,
    el('div', { class: 'bug-actions' }, [sendBtn]),
    el('p', { class: 'bug-alt' }, [
      'Or email ',
      el('a', { class: 'bug-mail', href: `mailto:${reportConfig.SUPPORT_EMAIL}` }, reportConfig.SUPPORT_EMAIL),
    ]),
  ]);

  close = openModal(card, { label: 'Report an issue', focus: input });
}
