import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { sharpeRatio, annualizedVol, dispositionEffect, winRate, TradeLite } from "@/lib/autopsy";
import { fmtPct, fmtNum } from "@/lib/format";
import { Activity, TrendingUp, Brain, Target } from "lucide-react";

const Autopsy = () => {
  const { user } = useAuth();
  const [trades, setTrades] = useState<TradeLite[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("trades").select("symbol, side, quantity, price, executed_at").eq("user_id", user.id).order("executed_at")
      .then(({ data }) => { if (data) setTrades(data.map(t => ({ ...t, quantity: Number(t.quantity), price: Number(t.price) })) as TradeLite[]); });
  }, [user]);

  const metrics = useMemo(() => {
    // Build per-day equity-style returns from trade P&L (simplified)
    const dailyPnl: Record<string, number> = {};
    const queues: Record<string, { qty: number; price: number }[]> = {};
    for (const t of trades) {
      const day = t.executed_at.slice(0, 10);
      if (!queues[t.symbol]) queues[t.symbol] = [];
      if (t.side === "buy") {
        queues[t.symbol].push({ qty: t.quantity, price: t.price });
      } else {
        let remaining = t.quantity;
        let pnl = 0;
        while (remaining > 0 && queues[t.symbol].length) {
          const lot = queues[t.symbol][0];
          const used = Math.min(lot.qty, remaining);
          pnl += used * (t.price - lot.price);
          lot.qty -= used;
          remaining -= used;
          if (lot.qty <= 0) queues[t.symbol].shift();
        }
        dailyPnl[day] = (dailyPnl[day] ?? 0) + pnl;
      }
    }
    const returns = Object.values(dailyPnl).map(p => p / 100000); // % of starting bankroll proxy
    return {
      sharpe: sharpeRatio(returns),
      vol: annualizedVol(returns),
      disposition: dispositionEffect(trades),
      winRate: winRate(trades),
      tradeCount: trades.length,
    };
  }, [trades]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <p className="text-xs font-mono text-primary uppercase tracking-wider">Level 5</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">The Autopsy</h1>
        <p className="text-muted-foreground mt-1">Quantify your edge — and your blind spots — using the same metrics professional desks use.</p>
      </div>

      {trades.length === 0 ? (
        <Card className="p-8 text-center bg-card/60">
          <p className="text-sm text-muted-foreground">No trades to analyze yet. Place trades in Level 2 to unlock your autopsy.</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2" data-spotlight="sharpe">
          <Metric
            icon={TrendingUp}
            label="Sharpe Ratio"
            value={fmtNum(metrics.sharpe, 2)}
            description="Risk-adjusted return. Above 1 is good, above 2 is excellent."
            formula="Sharpe = (mean(R) − Rf) / σ(R) × √252"
            tone={metrics.sharpe > 1 ? "gain" : metrics.sharpe < 0 ? "loss" : undefined}
          />
          <Metric
            icon={Activity}
            label="Annualized Volatility"
            value={fmtPct(metrics.vol, 1)}
            description="Standard deviation of your daily returns, annualized. Lower means smoother equity curve."
            formula="σ_annual = σ_daily × √252"
          />
          <Metric
            icon={Brain}
            label="Disposition Effect"
            value={fmtNum(metrics.disposition, 2)}
            description="Tendency to sell winners too early and hold losers too long. Closer to 0 = more disciplined."
            formula="DE = PGR − PLR"
            tone={Math.abs(metrics.disposition) < 0.2 ? "gain" : "loss"}
          />
          <Metric
            icon={Target}
            label="Win Rate"
            value={fmtPct(metrics.winRate, 1)}
            description="Share of closed positions that ended in profit. Win rate alone is meaningless without P&L size."
            formula="Win Rate = winning closes / total closes"
          />
        </div>
      )}

      <Card className="p-5 bg-card/60">
        <h3 className="font-semibold mb-2">Trade log</h3>
        <p className="text-xs font-mono text-muted-foreground mb-3">{metrics.tradeCount} executions</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-mono">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="py-2">Date</th><th>Symbol</th><th>Side</th><th className="text-right">Qty</th><th className="text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {trades.slice(-15).reverse().map((t, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-2 text-muted-foreground">{t.executed_at.slice(0, 10)}</td>
                  <td>{t.symbol}</td>
                  <td className={t.side === "buy" ? "text-gain" : "text-loss"}>{t.side.toUpperCase()}</td>
                  <td className="text-right">{t.quantity}</td>
                  <td className="text-right">${t.price.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

const Metric = ({ icon: Icon, label, value, description, formula, tone }:
  { icon: typeof Activity; label: string; value: string; description: string; formula: string; tone?: "gain" | "loss" }) => (
  <Card className="p-5 bg-card/60">
    <div className="flex items-start justify-between mb-2">
      <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </div>
    <p className={`font-mono text-3xl font-semibold tabular-nums ${tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : ""}`}>{value}</p>
    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{description}</p>
    <div className="mt-3 rounded-md bg-secondary/60 border border-border/60 px-3 py-2 font-mono text-xs">{formula}</div>
  </Card>
);

export default Autopsy;
