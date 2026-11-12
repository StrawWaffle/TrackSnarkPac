// Categorical channel colors, in a fixed order validated for color-vision
// deficiency (dataviz reference palette). A channel's color comes from its
// position in the registry, so new channels take the next slot.
export const LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

/** CSS custom properties and the .cN (background), .fN (svg fill), .gN (gift hatch) classes for n channels. */
export function paletteCss(n: number): string {
  if (n > LIGHT.length) throw new Error(`Only ${LIGHT.length} validated channel colors; fold extra channels or extend the palette.`);
  const vars = (cols: string[]) => cols.slice(0, n).map((c, i) => `--s${i}: ${c};`).join(' ');
  const rules = Array.from({ length: n }, (_, i) =>
    `.c${i} { background: var(--s${i}); } .f${i} { fill: var(--s${i}); } .g${i} { --gc: var(--s${i}); }`).join('\n');
  return `:root { ${vars(LIGHT)} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${vars(DARK)} } }
:root[data-theme="dark"] { ${vars(DARK)} }
${rules}`;
}
