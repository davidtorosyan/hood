// The Rebuild LA journey: CHAPTERS flattened into steps, and which one is
// next. Build/link steps are done when that puzzle is built; drive steps when
// the drive is in the campaign ledger's `drives` list.
import { labelOf } from '../jigsaw/tree.js';
import DATA from '../data/freeways.json';
import { store } from '../store.js';
import { CHAPTERS, driveKey } from './chapters.js';
import { built } from './state.js';

const book = store.campaign;

export const STEPS = CHAPTERS.flatMap((ch, c) =>
  ch.steps.map(([kind, a, b]) => ({
    kind,
    chapter: c,
    id: kind === 'drive' ? driveKey(a, b) : a,
    ...(kind === 'drive' ? { drive: DATA.campaign[driveKey(a, b)], areas: [a, b] } : {}),
  })),
);

const drivesDone = () => book.get('drives') || [];
export const isDone = (step) => (step.kind === 'drive' ? drivesDone().includes(step.id) : built(step.id));
export function markDriven(step) {
  if (!isDone(step)) book.set('drives', [...drivesDone(), step.id]);
}
// The drives you've driven (their data), for drawing roads on the overworld.
export const drivenDrives = () => STEPS.filter((s) => s.kind === 'drive' && isDone(s)).map((s) => s.drive);

// The first step not yet done (null once the written chapters are finished).
export const nextStep = () => STEPS.find((s) => !isDone(s)) ?? null;
export const chapterOf = (step) => CHAPTERS[step.chapter];
// Is this the first drive of the journey (one arrow, with the finger demo)?
export const isFirstDrive = (step) => step === STEPS.find((s) => s.kind === 'drive');

// "Build Hollywood area" / "Drive Hollywood → Downtown" / "Connect Central L.A."
export function stepTitle(step) {
  if (step.kind === 'drive') return `Drive ${labelOf(step.drive.from)} → ${labelOf(step.drive.to)}`;
  return `${step.kind === 'link' ? 'Connect' : 'Build'} ${labelOf(step.id)}`;
}
