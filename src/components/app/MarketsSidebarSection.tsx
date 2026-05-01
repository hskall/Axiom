import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Search, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { STOCK_UNIVERSE } from "@/lib/stockUniverse";
import { supabase } from "@/integrations/supabase/client";
import { fmtUSD } from "@/lib/format";
import { cn } from "@/lib/utils";

interface QuoteRow {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
}

const REFRESH_MS = 15000;

interface Props {
  collapsed: boolean;
}

export const MarketsSidebarSection = ({ collapsed }: Props) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [quotes, setQuotes] = useState<Record<string, QuoteRow>>({});
  const [loading, setLoading] = useState(true);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return STOCK_UNIVERSE;
    return STOCK_UNIVERSE.filter(
      (s) =>
        s.symbol.includes(q) ||
        s.name.toUpperCase().includes(q) ||
        s.sector.toUpperCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const symbols = STOCK_UNIVERSE.map((s) => s.symbol);

    const load = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("markets-quotes", {
          body: { symbols },
        });
        if (cancelled || error || !data?.quotes) return;
        const map: Record<string, QuoteRow> = {};
        for (const q of data.quotes as QuoteRow[]) map[q.symbol] = q;
        setQuotes(map);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const open = (sym: string) => {
    navigate(`/app/trade?symbol=${encodeURIComponent(sym)}`);
  };

  if (collapsed) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>Markets</SidebarGroupLabel>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center justify-between">
        <span>Markets</span>
        {loading && <Loader2 className="h-3 w-3 animate-spin opacity-60" />}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="px-2 pb-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ticker…"
              className="h-8 pl-7 text-xs rounded-none"
            />
          </div>
        </div>
        <div className="max-h-[40vh] overflow-y-auto px-1 pb-2">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
          ) : (
            filtered.map((stock) => {
              const q = quotes[stock.symbol];
              const up = (q?.changePct ?? 0) >= 0;
              return (
                <button
                  key={stock.symbol}
                  onClick={() => open(stock.symbol)}
                  title={`${stock.symbol} · ${stock.name}`}
                  className={cn(
                    "group w-full flex items-center justify-between gap-2 px-2 py-1.5",
                    "text-left text-xs border-0 rounded-none",
                    "hover:bg-sidebar-accent transition-colors",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{stock.symbol}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {stock.name}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {q ? (
                      <>
                        <div className="tabular-nums">{fmtUSD(q.price)}</div>
                        <div
                          className={cn(
                            "flex items-center justify-end gap-0.5 text-[10px] tabular-nums",
                            up ? "text-primary" : "text-destructive",
                          )}
                        >
                          {up ? (
                            <TrendingUp className="h-2.5 w-2.5" />
                          ) : (
                            <TrendingDown className="h-2.5 w-2.5" />
                          )}
                          {q.changePct >= 0 ? "+" : ""}
                          {q.changePct.toFixed(2)}%
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] text-muted-foreground">—</div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};