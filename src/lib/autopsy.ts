// Behavioral analytics for Level 5.
// All formulas operate on a chronological list of trades and (optionally) per-day returns.

export interface TradeLite {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  executed_at: string;
}

/** Sample standard deviation. */
export const stdev = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
};

export const mean = (xs: number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

/**
 * Sharpe Ratio = (mean(returns) - rf) / stdev(returns), annualized.
 * `returns` are periodic (daily) decimal returns. `rf` annual risk-free.
 */
export const sharpeRatio = (returns: number[], rf = 0.045, periodsPerYear = 252): number => {
  if (returns.length < 2) return 0;
  const dailyRf = rf / periodsPerYear;
  const excess = returns.map((r) => r - dailyRf);
  const sd = stdev(returns);
  if (sd === 0) return 0;
  return (mean(excess) / sd) * Math.sqrt(periodsPerYear);
};

/** Annualized volatility from periodic returns. */
export const annualizedVol = (returns: number[], periodsPerYear = 252): number =>
  stdev(returns) * Math.sqrt(periodsPerYear);

/**
 * Disposition Effect = PGR - PLR, where:
 *   PGR (Proportion of Gains Realized) = realized gains / (realized + paper gains)
 *   PLR (Proportion of Losses Realized) = realized losses / (realized + paper losses)
 *
 * Simplified version: from completed buy→sell pairs, count how many sells closed at a profit
 * vs. at a loss, and compute PGR - PLR using sell counts as a proxy.
 */
export const dispositionEffect = (trades: TradeLite[]): number => {
  // FIFO pair buys with sells per symbol
  const queues: Record<string, { qty: number; price: number }[]> = {};
  let realizedGains = 0;
  let realizedLosses = 0;
  for (const t of [...trades].sort((a, b) => a.executed_at.localeCompare(b.executed_at))) {
    if (!queues[t.symbol]) queues[t.symbol] = [];
    if (t.side === "buy") {
      queues[t.symbol].push({ qty: t.quantity, price: t.price });
    } else {
      let remaining = t.quantity;
      while (remaining > 0 && queues[t.symbol].length) {
        const lot = queues[t.symbol][0];
        const used = Math.min(lot.qty, remaining);
        if (t.price > lot.price) realizedGains++;
        else if (t.price < lot.price) realizedLosses++;
        lot.qty -= used;
        remaining -= used;
        if (lot.qty <= 0) queues[t.symbol].shift();
      }
    }
  }
  const total = realizedGains + realizedLosses;
  if (!total) return 0;
  // Simplified proxy: ratio of profit-taking vs loss-cutting
  return realizedGains / total - realizedLosses / total;
};

/** Win rate: profitable closed positions / total closed positions. */
export const winRate = (trades: TradeLite[]): number => {
  const queues: Record<string, { qty: number; price: number }[]> = {};
  let wins = 0, total = 0;
  for (const t of [...trades].sort((a, b) => a.executed_at.localeCompare(b.executed_at))) {
    if (!queues[t.symbol]) queues[t.symbol] = [];
    if (t.side === "buy") {
      queues[t.symbol].push({ qty: t.quantity, price: t.price });
    } else {
      let remaining = t.quantity;
      while (remaining > 0 && queues[t.symbol].length) {
        const lot = queues[t.symbol][0];
        const used = Math.min(lot.qty, remaining);
        total++;
        if (t.price > lot.price) wins++;
        lot.qty -= used;
        remaining -= used;
        if (lot.qty <= 0) queues[t.symbol].shift();
      }
    }
  }
  return total ? wins / total : 0;
};
