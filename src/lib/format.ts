export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export const usd = (x: number, cents = false): string =>
  '$' + x.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });

export const pct = (x: number): string => (x * 100).toFixed(0) + '%';

export const hms = (s: number): string => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
};

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const mlabel = (ym: string): string => MON[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);

/** "Pisco's", "Counterpoints'" */
export const possessive = (name: string): string => name + (name.endsWith('s') ? "'" : "'s");

/** "a, b and c" */
export const listJoin = (parts: string[]): string =>
  parts.length < 2 ? parts.join('') : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
