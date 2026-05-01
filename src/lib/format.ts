export const fmtUSD = (n: number, opts: Intl.NumberFormatOptions = {}) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2, ...opts }).format(n);

export const fmtPct = (n: number, digits = 2) =>
  `${n >= 0 ? "+" : ""}${(n * 100).toFixed(digits)}%`;

export const fmtNum = (n: number, digits = 2) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
