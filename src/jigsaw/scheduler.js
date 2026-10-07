// Every deferred thing a Board does (animation frames, end-of-transition timers,
// hint delays) goes through one Scheduler, so a single `dispose()` stops them all.
// Without that, a board you'd navigated away from could keep firing timers that
// save the wrong level or navigate a second time.
export class Scheduler {
  #timers = new Set();
  #frames = new Set();
  #dead = false;

  // Run `fn` after `ms`. Returns an id for cancel().
  after(ms, fn) {
    if (this.#dead) return 0;
    const id = setTimeout(() => {
      this.#timers.delete(id);
      fn();
    }, ms);
    this.#timers.add(id);
    return id;
  }

  cancel(id) {
    if (!id) return;
    clearTimeout(id);
    this.#timers.delete(id);
  }

  // Drive `onFrame(k)` with k going 0→1 over `ms`, then call `onDone`. Returns a
  // handle with cancel().
  animate(ms, onFrame, onDone) {
    const t0 = performance.now();
    let raf = 0;
    const handle = {
      cancel: () => {
        cancelAnimationFrame(raf);
        this.#frames.delete(handle);
      },
    };
    if (this.#dead) return handle;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      onFrame(k);
      if (k < 1) {
        raf = requestAnimationFrame(step);
      } else {
        this.#frames.delete(handle);
        onDone?.();
      }
    };
    this.#frames.add(handle);
    raf = requestAnimationFrame(step);
    return handle;
  }

  cancelAll() {
    for (const id of this.#timers) clearTimeout(id);
    this.#timers.clear();
    for (const h of [...this.#frames]) h.cancel();
  }

  // Stop everything for good: later after()/animate() calls are ignored.
  dispose() {
    this.cancelAll();
    this.#dead = true;
  }
}
