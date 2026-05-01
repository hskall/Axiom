import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { LEVELS } from "@/lib/levels";
import { fmtUSD, fmtPct } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  TrendingUp, TrendingDown, Wallet, BarChart3, HelpCircle, ExternalLink,
} from "lucide-react";
import { useSpotlight } from "@/components/spotlight/SpotlightProvider";
import { onboardingTour } from "@/lib/levels";
import Budget from "./Budget";
import Algo from "./Algo";
import Autopsy from "./Autopsy";
import Crisis from "./Crisis";

const Dashboard = () => {
  const { user } = useAuth();
  const { start } = useSpotlight();
  const [cash, setCash] = useState(100000);
  const [holdingsValue, setHoldingsValue] = useState(0);
  const [name, setName] = useState<string>("");
  const [dayPnl] = useState(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles").select("paper_cash, display_name").eq("id", user.id).maybeSingle();
      if (profile) {
        setCash(Number(profile.paper_cash));
        setName(profile.display_name ?? "");
      }
      const { data: holdings } = await supabase
        .from("portfolios").select("quantity, avg_cost").eq("user_id", user.id);
      if (holdings) {
        setHoldingsValue(holdings.reduce((s, h) => s + Number(h.quantity) * Number(h.avg_cost), 0));
      }
    })();
  }, [user]);

  const equity = cash + holdingsValue;
  const dayPct = equity ? dayPnl / equity : 0;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
            Welcome back{name ? `, ${name}` : ""}
          </p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Trading Desk</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => start(onboardingTour)} className="h-8">
          <HelpCircle className="h-3.5 w-3.5 mr-1.5" /> Replay tour
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard
          spotlight="portfolio-value"
          label="Portfolio Value"
          value={fmtUSD(equity)}
          sub={`${dayPnl >= 0 ? "+" : ""}${fmtUSD(dayPnl)} today (${fmtPct(dayPct)})`}
          subTone={dayPnl >= 0 ? "gain" : "loss"}
          icon={dayPnl >= 0 ? TrendingUp : TrendingDown}
        />
        <StatCard
          spotlight="cash"
          label="Available Cash"
          value={fmtUSD(cash)}
          sub="Liquid buying power"
          icon={Wallet}
        />
        <StatCard
          label="Holdings Value"
          value={fmtUSD(holdingsValue)}
          sub="Market value of open positions"
          icon={BarChart3}
        />
      </div>

      {/* Equity curve */}
      <Card className="p-5 bg-card/60">
        <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">Equity Curve</p>
        <div className="h-40 mt-3 bg-secondary/40 border border-dashed border-border flex items-center justify-center">
          <p className="text-xs text-muted-foreground font-mono">No trades yet · open the Trade Desk to begin</p>
        </div>
      </Card>

      {/* Tools — expanding windows */}
      <div data-spotlight="tools-grid">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Tools</h2>
          <p className="text-[11px] font-mono text-muted-foreground">Click any tool to expand</p>
        </div>

        <Accordion type="multiple" className="space-y-2">
          {LEVELS.map((l) => {
            const isTrade = l.slug === "trade";
            return (
              <AccordionItem
                key={l.slug}
                value={l.slug}
                className="border border-border bg-card/60"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-secondary/40 [&[data-state=open]]:bg-secondary/40">
                  <div className="flex items-center gap-3 flex-1 text-left">
                    <div className="h-8 w-8 bg-secondary flex items-center justify-center shrink-0">
                      <l.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground">L{l.num}</span>
                        <span className="font-semibold text-sm">{l.name}</span>
                      </div>
                      <p className="text-xs font-mono text-primary/80 mt-0.5 truncate">{l.tagline}</p>
                    </div>
                    {isTrade && (
                      <Link
                        to={l.path}
                        onClick={(e) => e.stopPropagation()}
                        className="h-7 px-2 flex items-center gap-1 text-[11px] font-mono text-primary hover:bg-primary/10"
                      >
                        Open full <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="border-t border-border">
                  <div className="p-2 md:p-4">
                    {l.slug === "budget" && <Budget />}
                    {l.slug === "trade" && <TradePreview path={l.path} />}
                    {l.slug === "crisis" && <Crisis />}
                    {l.slug === "algo" && <Algo />}
                    {l.slug === "autopsy" && <Autopsy />}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </div>
  );
};

const TradePreview = ({ path }: { path: string }) => (
  <div className="bg-secondary/30 border border-border p-6 text-center">
    <p className="text-sm text-muted-foreground mb-3 max-w-md mx-auto">
      The Trade Desk is a full-screen workspace — charts, drawing tools, indicators, an order book and an order ticket.
      Open it in its own window to use everything at full resolution.
    </p>
    <Button asChild>
      <Link to={path}>
        Launch Trade Desk <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
      </Link>
    </Button>
  </div>
);

const StatCard = ({
  label, value, sub, subTone, icon: Icon, spotlight,
}: {
  label: string; value: string; sub?: string; subTone?: "gain" | "loss";
  icon: typeof Wallet; spotlight?: string;
}) => (
  <Card className="p-4 bg-card/60" data-spotlight={spotlight}>
    <div className="flex items-start justify-between mb-2">
      <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
    </div>
    <p className="font-mono text-2xl md:text-3xl font-semibold tabular-nums">{value}</p>
    {sub && (
      <p className={`text-[11px] font-mono mt-1 ${subTone === "gain" ? "text-gain" : subTone === "loss" ? "text-loss" : "text-muted-foreground"}`}>
        {sub}
      </p>
    )}
  </Card>
);

export default Dashboard;
