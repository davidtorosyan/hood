// The board's HTML chrome, layered with the SVG: the two fixed canvas panels
// (build + tray), the "Place ▸ X" prompt between them, and the solved-board tray
// content (what-next tip + Play again). Pure presentation — the Board tells it
// what to show.
import { el } from '../ui/dom.js';

const pct = (v) => `${(v * 100).toFixed(2)}%`;

export class Stage {
  // onReplay: the Play again button.
  constructor({ onReplay }) {
    this.buildPanel = el('div', { class: 'jig-canvas jig-canvas-build' });
    this.trayPanel = el('div', { class: 'jig-canvas jig-canvas-tray' });

    // The prompt: which piece to place next, by name. aria-live so a screen
    // reader announces each new ask.
    this.promptName = el('b', { class: 'jig-prompt-name' }, '');
    this.promptCount = el('span', { class: 'jig-prompt-count' }, '');
    this.promptMain = el('div', { class: 'jig-prompt-main' }, [
      (this.promptVerb = el('span', { class: 'jig-prompt-verb' }, 'Place')),
      this.promptName,
      this.promptCount,
    ]);
    this.promptSub = el('div', { class: 'jig-prompt-sub' }, '');
    this.prompt = el('div', { class: 'jig-prompt', 'aria-live': 'polite' }, [this.promptMain, this.promptSub]);
    this.prompt.style.display = 'none';

    this.replayBtn = el('button', { class: 'jig-btn jig-replay', onClick: onReplay }, '🔀 Play again');
    this.tip = el('div', { class: 'jig-tip' }, '');
    this.chips = el('div', { class: 'jig-chips' });
    this.solved = el('div', { class: 'jig-tray-solved' }, [this.tip, this.chips, this.replayBtn]);
    this.solved.style.display = 'none';
  }

  // Mount around the svg: panels under it, prompt + solved content over it.
  mount(svg) {
    return el('div', { class: 'jig-stage' }, [this.buildPanel, this.trayPanel, svg, this.prompt, this.solved]);
  }

  // Position everything for a layout (stacked portrait / side-by-side landscape).
  place(layout) {
    const box = (elm, [x0, y0, x1, y1]) =>
      Object.assign(elm.style, { left: pct(x0), right: pct(1 - x1), top: pct(y0), bottom: pct(1 - y1) });
    box(this.buildPanel, layout.build);
    box(this.trayPanel, layout.tray);
    const [bx0, by0, bx1, by1] = layout.build;
    const [tx0, ty0, tx1, ty1] = layout.tray;
    box(this.solved, layout.tray);
    if (layout.wide) {
      // Side by side: the prompt sits in the band above the tray.
      Object.assign(this.prompt.style, { left: pct(tx0), right: pct(1 - tx1), top: pct((by0 + ty0) / 2) });
    } else {
      // Portrait: centred in the gap between the map and the tray.
      Object.assign(this.prompt.style, { left: pct(bx0), right: pct(1 - bx1), top: pct((by1 + ty0) / 2) });
    }
  }

  // --- the prompt ---
  ask(name, n, total, sub = '') {
    this.prompt.style.display = '';
    this.prompt.classList.remove('celebrate');
    this.promptVerb.textContent = 'Place';
    this.promptName.textContent = name;
    this.promptCount.textContent = `${n}/${total}`;
    this.setSub(sub);
    // Pop the pill so each new ask registers.
    this.prompt.classList.remove('pop', 'nope');
    void this.prompt.offsetWidth;
    this.prompt.classList.add('pop');
  }

  setSub(text) {
    this.promptSub.textContent = text;
    this.promptSub.style.display = text ? '' : 'none';
  }

  // Wrong piece grabbed: shake the pill and say which one that was.
  nope(sub) {
    this.setSub(sub);
    this.prompt.classList.remove('pop', 'nope');
    void this.prompt.offsetWidth;
    this.prompt.classList.add('nope');
  }

  hidePrompt() {
    this.prompt.style.display = 'none';
  }

  // The prompt pill turned celebration: "🎉 South Bay & Harbor solved!"
  celebrate(name) {
    this.prompt.style.display = '';
    this.prompt.classList.add('celebrate');
    this.promptVerb.textContent = '🎉';
    this.promptName.textContent = name;
    this.promptCount.textContent = 'solved!';
    this.setSub('');
    this.prompt.classList.remove('pop', 'nope');
    void this.prompt.offsetWidth;
    this.prompt.classList.add('pop');
  }

  // --- solved tray ---
  // tip: what to do next · chips: the level's pieces by name ({ label, done,
  // onClick }) — another way in, handy for slivers too small to tap on the map.
  showSolved({ tip, chips = [] }) {
    this.tip.textContent = tip;
    this.chips.replaceChildren(
      ...chips.map((c) =>
        el('button', { class: `jig-chip${c.done ? ' done' : ''}`, onClick: c.onClick }, c.done ? `${c.label} ✓` : c.label),
      ),
    );
    this.solved.style.display = '';
    // The chips are a bonus; if the tray can't fit them all, drop them rather
    // than show a row sliced in half.
    this.chips.style.display = '';
    if (this.chips.scrollHeight > this.chips.clientHeight + 1) this.chips.style.display = 'none';
  }

  hideSolved() {
    this.solved.style.display = 'none';
  }
}
