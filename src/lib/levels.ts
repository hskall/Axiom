import { Wallet, LineChart, AlertTriangle, Cpu, Activity, LayoutDashboard, LucideIcon } from "lucide-react";

export interface LevelDef {
  num: number;
  slug: string;
  path: string;
  name: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  accent: string;
}

export const DASHBOARD: { path: string; name: string; icon: LucideIcon } = {
  path: "/app",
  name: "Dashboard",
  icon: LayoutDashboard,
};

export const LEVELS: LevelDef[] = [
  {
    num: 1,
    slug: "budget",
    path: "/app/budget",
    name: "Personal Budgeter",
    tagline: "Cash in, cash out",
    description: "Track income and expenses, build an emergency fund, and master your monthly cash flow before you risk a dollar in markets.",
    icon: Wallet,
    accent: "from-emerald-500/20 to-emerald-500/0",
  },
  {
    num: 2,
    slug: "trade",
    path: "/app/trade",
    name: "Equity Explorer",
    tagline: "Real-time paper trading",
    description: "Search live tickers, read candlestick charts and order books, and execute risk-free trades with instant fills.",
    icon: LineChart,
    accent: "from-blue-500/20 to-blue-500/0",
  },
  {
    num: 3,
    slug: "crisis",
    path: "/app/crisis",
    name: "Crisis Time Machine",
    tagline: "Stress-test your portfolio",
    description: "Replay the 2008 GFC, 2020 COVID crash and other historical shocks against your live portfolio. See exactly what would have happened.",
    icon: AlertTriangle,
    accent: "from-amber-500/20 to-amber-500/0",
  },
  {
    num: 4,
    slug: "algo",
    path: "/app/algo",
    name: "Algorithm Builder",
    tagline: "Code-free automation",
    description: "Compose trading rules visually — \"If RSI < 30, buy 10 shares\" — and let the engine execute while you sleep.",
    icon: Cpu,
    accent: "from-violet-500/20 to-violet-500/0",
  },
  {
    num: 5,
    slug: "autopsy",
    path: "/app/autopsy",
    name: "The Autopsy",
    tagline: "Behavioral analytics",
    description: "Quantify your edge — and your blind spots — with Sharpe ratio, volatility, win rate, and the disposition effect.",
    icon: Activity,
    accent: "from-pink-500/20 to-pink-500/0",
  },
];

export const onboardingTour = [
  {
    id: "intro",
    title: "Welcome to Axiom",
    body: "Axiom is a 5-level paper-trading lab. You start with $100,000 in virtual cash. Every level teaches a real-world skill — from budgeting to behavioral finance. Let's take a 60-second tour.",
    selector: null,
    placement: "center" as const,
  },
  {
    id: "sidebar",
    title: "The Desk",
    body: "Your dashboard is the entire trading desk. Tools for every level live here as expanding panels — no more jumping between pages.",
    selector: "[data-spotlight='sidebar']",
    placement: "right" as const,
  },
  {
    id: "portfolio-value",
    title: "Portfolio Value",
    body: "Your total equity = cash on hand + market value of all open positions. It updates in real-time as quotes move. This is your scoreboard.",
    formula: "Equity = Cash + Σ (Quantityᵢ × Priceᵢ)",
    selector: "[data-spotlight='portfolio-value']",
    placement: "bottom" as const,
  },
  {
    id: "cash",
    title: "Available Cash",
    body: "Liquid buying power. Every buy debits cash; every sell credits it. Keep a reserve for opportunities and emergencies — that's Level 1's lesson.",
    selector: "[data-spotlight='cash']",
    placement: "bottom" as const,
  },
  {
    id: "tools",
    title: "Your Toolkit",
    body: "Open any panel below — Budgeter, Trade Desk, Algo Builder, Autopsy, or the live Crisis feed. They all share one portfolio and one cash balance.",
    selector: "[data-spotlight='tools-grid']",
    placement: "top" as const,
  },
];

/** Spotlight tour for the Trade Desk (Level 2) */
export const tradeTour = [
  {
    id: "trade-intro",
    title: "The Trade Desk",
    body: "This is a full professional charting workspace — modeled on TradingView's paper trading layout. Charts, drawing tools, indicators, an order book and a one-click order ticket, all in one screen.",
    selector: null,
    placement: "center" as const,
  },
  {
    id: "trade-toolbar",
    title: "Top toolbar",
    body: "Symbol search, intervals (1m → 1M), chart type, indicators, compare and alerts. Switch ticker or timeframe and the chart redraws in place.",
    selector: "[data-spotlight='trade-toolbar']",
    placement: "bottom" as const,
  },
  {
    id: "trade-tools",
    title: "Drawing tool rail",
    body: "Trend lines, horizontal levels, text, ruler, Fib tools — everything you'd use to mark up a chart. Pick a tool and click on the chart to draw.",
    selector: "[data-spotlight='trade-tools']",
    placement: "right" as const,
  },
  {
    id: "trade-chart",
    title: "Live candlestick chart",
    body: "Each candle compresses one period into four numbers: Open, High, Low, Close. The body is filled green when Close > Open (buyers won), red when Close < Open (sellers won). The thin wicks are the extremes the price probed before settling. Long lower wicks under support = rejected lows. Long upper wicks at resistance = rejected highs. That's the entire language of price action.",
    formula: "Body = |Close − Open|   ·   Wick = High − Low",
    selector: "[data-spotlight='trade-chart']",
    placement: "left" as const,
  },
  {
    id: "trade-stoploss",
    title: "Why a Stop-Loss is non-negotiable",
    body: "Switch the order type to Stop-Loss to pre-commit your exit. A stop fires automatically when price crosses your trigger, even if you're asleep or paralysed. The single biggest behavioural mistake on this desk — every desk — is letting a small loss compound into a portfolio-killer because 'it'll come back.' Stops convert that emotional decision into a mechanical one. Set them before you enter, never after.",
    formula: "Max loss per trade ≈ (Entry − Stop) × Quantity",
    selector: "[data-spotlight='trade-panel']",
    placement: "top" as const,
  },
  {
    id: "trade-rsi",
    title: "Volume & RSI",
    body: "Open Indicators → enable VOL and RSI. Volume tells you whether a move had real participation (high bars) or was thin and fragile. RSI(14) measures momentum on a 0–100 scale — above 70 is overbought, below 30 is oversold. They live in dedicated panes under the price chart so they never crowd the candles.",
    formula: "RSI = 100 − 100 / (1 + avg gain / avg loss)  over 14 periods",
    selector: "[data-spotlight='trade-chart']",
    placement: "left" as const,
  },
  {
    id: "trade-panel",
    title: "Bottom workspace",
    body: "Trading Panel is your order ticket — Market, Limit and Stop-Loss types. Limit waits for your price; Stop-Loss is your circuit-breaker. Order Book shows depth, Positions is your live blotter, Working Orders are pending fills. Every executed order instantly hits your cash and portfolio.",
    selector: "[data-spotlight='trade-panel']",
    placement: "top" as const,
  },
];

/** Behavioural-finance tour for The Autopsy (Level 5). */
export const autopsyTour = [
  {
    id: "autopsy-intro",
    title: "Luck vs. Skill",
    body: "Anyone can get rich in a bull market. The Autopsy strips away the noise and asks the only question that matters: are your returns the product of repeatable skill, or were you just standing in front of a tailwind?",
    selector: null,
    placement: "center" as const,
  },
  {
    id: "autopsy-sharpe",
    title: "The Sharpe Ratio",
    body: "Sharpe is return per unit of risk. A Sharpe of 1 is decent, 2 is excellent, 3 is world-class. Crucially, it punishes wild swings: a trader who made 30% with white-knuckle volatility scores worse than one who made 12% smoothly. That's the difference between a lucky punt and a real edge.",
    formula: "Sₚ = (Rₚ − R_f) / σₚ × √252",
    selector: "[data-spotlight='sharpe']",
    placement: "bottom" as const,
  },
];
