// The "Report a bug" dialog: a short description box, plus two ways to send it —
// straight to a form (emails you) or as a pre-filled GitHub issue. A bit of
// context (where you were, which build, browser) is attached automatically.
import { el } from './ui/dom.js';
import { bugContext, countEvent, reportConfig } from './telemetry.js';

export function openBugReport() {
  countEvent('bug-open');
  const ctx = bugContext();
  const contextBlock =
    `\n\n---\nwhere: ${ctx.where}\nbuild: ${ctx.version}\nscreen: ${ctx.size}\nurl: ${ctx.url}\nbrowser: ${ctx.ua}`;

  const input = el('textarea', {
    class: 'bug-input',
    rows: '4',
    placeholder: 'What happened? What did you expect? Steps if you have them.',
  });
  const status = el('div', { class: 'bug-status' }, '');

  const backdrop = el('div', { class: 'card-backdrop' });
  const close = () => {
    backdrop.classList.remove('show');
    setTimeout(() => backdrop.remove(), 200);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => e.key === 'Escape' && close();

  const githubBtn = el(
    'button',
    {
      class: 'jig-btn bug-action',
      onClick: () => {
        const title = 'Bug: ' + ((input.value.trim().split('\n')[0] || 'report').slice(0, 60));
        const body = (input.value.trim() || '(describe what happened)') + contextBlock;
        const url = `https://github.com/${reportConfig.GITHUB_REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
        window.open(url, '_blank', 'noopener');
        countEvent('bug-github');
        close();
      },
    },
    'Open on GitHub',
  );

  const sendBtn = reportConfig.FORM_ENDPOINT
    ? el(
        'button',
        {
          class: 'jig-btn bug-action bug-send',
          onClick: async () => {
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
                body: JSON.stringify({ message: input.value.trim(), ...ctx }),
              });
              if (!res.ok) throw new Error('bad status');
              countEvent('bug-sent');
              status.textContent = 'Thanks — sent! 🙌';
              setTimeout(close, 1200);
            } catch {
              sendBtn.disabled = false;
              status.textContent = "Couldn't send — try “Open on GitHub”.";
            }
          },
        },
        'Send',
      )
    : null;

  const card = el('div', { class: 'card bug-card', role: 'dialog', 'aria-label': 'Report a bug' }, [
    el('button', { class: 'card-close', onClick: close, 'aria-label': 'Close' }, '✕'),
    el('h2', { class: 'card-name bug-title' }, '🐞 Report a bug'),
    el('p', { class: 'bug-note' }, 'Tell us what went wrong — a little context is attached automatically.'),
    input,
    status,
    el('div', { class: 'bug-actions' }, [sendBtn, githubBtn].filter(Boolean)),
  ]);

  backdrop.append(card);
  backdrop.addEventListener('click', (e) => e.target === backdrop && close());
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  requestAnimationFrame(() => {
    backdrop.classList.add('show');
    input.focus();
  });
}
