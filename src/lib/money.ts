export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function euros(n: number): string {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  const [whole, frac] = abs.toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${grouped},${frac}`;
}

export function euroLabel(n: number): string {
  return `${euros(n)} €`;
}
