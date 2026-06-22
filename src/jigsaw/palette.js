// Distinct pastel fills so assembled pieces read like a map rather than one
// uniform blob. Assigned by sibling index; every level is capped at CAP pieces,
// so each piece in a level gets its own colour.
export const PALETTE = [
  '#8ecaa3', // green
  '#f2c673', // amber
  '#9bb8ec', // blue
  '#ec9f9b', // coral
  '#bda9e0', // violet
  '#7ecabf', // teal
  '#d9b483', // tan
];

export const colorForIndex = (i) => PALETTE[i % PALETTE.length];
