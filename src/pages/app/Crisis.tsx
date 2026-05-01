import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fmtUSD, fmtPct } from "@/lib/format";
import { AlertTriangle, ShieldCheck, Radio, Shield, Zap, Square } from "lucide-react";
import { toast } from "sonner";

interface Scenario {
  id: string; slug: string; name: string; description: string;
  period_label: string; shock_pct: number;
}
interface CrisisEvent {
  id: string; scenario_id: string; active: boolean; started_at: string; ended_at: string | null;
}
interface Holding { symbol: string; quantity: number; avg_cost: number; }

/**
 * Crisis Time Machine — Level 3
 * Crises are NOT user-selectable. They are triggered randomly by the platform
 * (or manually by an admin) and broadcast to every desk. This page is a
 * passive monitor that shows the current alert + a projected impact on
 * the user's portfolio.
 */
const Crisis = () => {
  const { user } = useAuth();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [event, setEvent] = useState<CrisisEvent | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [cash, setCash] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  const scenario = event ? scenarios.find(s => s.id === event.scenario_id) ?? null : null;
  const active = !!event?.active;

  const loadActive = useCallback(async () => {
    const { data } = await supabase
      .from("crisis_events")
      .select("*")
      .eq("active", true)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setEvent((data as CrisisEvent | null) ?? null);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("crisis_scenarios").select("*").order("name");
      if (data) setScenarios(data as unknown as Scenario[]);
    })();
    loadActive();
  }, [loadActive]);

  // Realtime: every desk hears the broadcast the instant an admin fires it.
  useEffect(() => {
    const channel = supabase
      .channel("crisis_events_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "crisis_events" }, (payload) => {
        if (payload.eventType === "INSERT" && (payload.new as CrisisEvent).active) {
          const ev = payload.new as CrisisEvent;
          setEvent(ev);
          toast.error("⚠ MARKET SHOCK — broadcast received", { duration: 6000 });
        } else if (payload.eventType === "UPDATE") {
          const ev = payload.new as CrisisEvent;
          if (!ev.active) setEvent(null);
          else setEvent(ev);
        } else {
          loadActive();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadActive]);

  // Admin status
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    (async () => {
      const { data } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      setIsAdmin(!!data);
    })();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: p } = await supabase.from("profiles").select("paper_cash").eq("id", user.id).maybeSingle();
      if (p) setCash(Number(p.paper_cash));
      const { data: h } = await supabase.from("portfolios").select("symbol, quantity, avg_cost").eq("user_id", user.id);
      if (h) setHoldings(h.map(x => ({ symbol: x.symbol, quantity: Number(x.quantity), avg_cost: Number(x.avg_cost) })));
    })();
  }, [user]);

  const equity = cash + holdings.reduce((s, h) => s + h.quantity * h.avg_cost, 0);
  const projected = scenario && active
    ? cash + holdings.reduce((s, h) => s + h.quantity * h.avg_cost * (1 + Number(scenario.shock_pct)), 0)
    : equity;
  const damage = projected - equity;

  const fireScenario = async (scenarioId: string) => {
    if (!user) return;
    setBusy(true);
    try {
      // End any currently-active event first.
      if (event?.active) {
        await supabase.from("crisis_events").update({ active: false, ended_at: new Date().toISOString() }).eq("id", event.id);
      }
      const { error } = await supabase.from("crisis_events").insert({
        scenario_id: scenarioId, triggered_by: user.id, active: true,
      });
      if (error) throw error;
      toast.success("Shock broadcast to all desks");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to fire shock");
    } finally { setBusy(false); }
  };

  const allClear = async () => {
    if (!event) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("crisis_events").update({ active: false, ended_at: new Date().toISOString() }).eq("id", event.id);
      if (error) throw error;
      toast.success("All clear broadcast");
      setEvent(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div>
        <p className="text-xs font-mono text-primary uppercase tracking-wider">Level 3</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Crisis Time Machine</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Crises strike without warning. The platform broadcasts a market shock — your only choice is how you respond.
        </p>
      </div>

      <Card
        className={`p-5 border-2 ${active ? "border-loss bg-loss/5" : "border-gain/40 bg-gain/5"}`}
        data-spotlight="crisis-status"
      >
        <div className="flex items-start gap-3">
          {active ? (
            <AlertTriangle className="h-6 w-6 text-loss shrink-0 mt-0.5" />
          ) : (
            <ShieldCheck className="h-6 w-6 text-gain shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Radio className={`h-3 w-3 ${active ? "text-loss animate-pulse" : "text-gain"}`} />
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Market status feed
              </p>
            </div>
            {active && scenario ? (
              <>
                <h2 className="text-xl font-bold mt-1">SHOCK ACTIVE — {scenario.name}</h2>
                <p className="text-xs font-mono text-muted-foreground mt-1">{scenario.period_label}</p>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{scenario.description}</p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold mt-1">All clear · markets stable</h2>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  No active shock. The next crisis is unpredictable — that's the point.
                  When the broadcast flips, your portfolio is repriced instantly.
                </p>
              </>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Current equity" value={fmtUSD(equity)} />
        <StatCard
          label={active ? "Projected equity" : "Projected (no shock)"}
          value={fmtUSD(projected)}
          tone={damage < 0 ? "loss" : undefined}
        />
        <StatCard
          label="Projected damage"
          value={`${damage >= 0 ? "+" : ""}${fmtUSD(damage)}`}
          sub={scenario ? `Shock = ${fmtPct(Number(scenario.shock_pct))}` : ""}
          tone={damage < 0 ? "loss" : "gain"}
        />
      </div>

      {holdings.length === 0 && (
        <Card className="p-5 bg-card/60">
          <p className="text-sm text-muted-foreground italic">
            You have no open positions. Visit the Trade desk and build a portfolio first —
            crises only matter when you have skin in the game.
          </p>
        </Card>
      )}

      <Card className="p-5 bg-card/60">
        <h3 className="font-semibold mb-2">How this works</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Historical shocks (2008 GFC, 2020 COVID, dot-com, etc.) are pre-loaded.
          A platform admin fires one when they choose — the broadcast hits every desk in real time
          via the <span className="font-mono text-foreground">crisis_events</span> channel. Your portfolio
          is re-marked instantly, and your reaction is what's graded in The Autopsy.
        </p>
      </Card>

      {isAdmin && (
        <Card className="p-5 border-2 border-primary/40 bg-primary/5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-4 w-4 text-primary" />
            <p className="text-[11px] font-mono uppercase tracking-wider text-primary">Admin console</p>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Fire any historical shock to every active desk. Use sparingly — it overwrites the live feed for everyone.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {scenarios.map(s => (
              <button
                key={s.id}
                disabled={busy}
                onClick={() => fireScenario(s.id)}
                className="flex items-center justify-between gap-2 p-3 border border-border bg-card hover:bg-secondary text-left disabled:opacity-50"
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs font-semibold truncate">{s.name}</p>
                  <p className="text-[10px] font-mono text-muted-foreground">{s.period_label} · shock {fmtPct(Number(s.shock_pct))}</p>
                </div>
                <Zap className="h-4 w-4 text-primary shrink-0" />
              </button>
            ))}
          </div>
          {event?.active && (
            <Button variant="outline" size="sm" className="mt-4 rounded-none" onClick={allClear} disabled={busy}>
              <Square className="h-3.5 w-3.5 mr-2" /> Broadcast all-clear
            </Button>
          )}
        </Card>
      )}
    </div>
  );
};

const StatCard = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "gain" | "loss" }) => (
  <Card className="p-4 bg-card/60">
    <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
    <p className={`font-mono text-xl font-semibold mt-1 ${tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : ""}`}>{value}</p>
    {sub && <p className="text-[10px] font-mono text-muted-foreground mt-1">{sub}</p>}
  </Card>
);

export default Crisis;
