import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { fmtUSD, fmtPct } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Search, TrendingUp, TrendingDown, Loader2, HelpCircle,
  MousePointer2, Crosshair, Minus, TrendingUp as TrendIcon, Type, Ruler,
  Eraser, Magnet, Eye, Lock, Camera, Bell, Settings2, Layers,
  CandlestickChart, BarChart3, LineChart as LineChartIcon, Activity,
  Plus, X,
} from "lucide-react";
import {
  createChart, CandlestickSeries, LineSeries, BarSeries, AreaSeries,
  HistogramSeries, IChartApi, ISeriesApi, Time, IPriceLine, LineStyle, MouseEventParams,
} from "lightweight-charts";
import { useSpotlight } from "@/components/spotlight/SpotlightProvider";
import { tradeTour } from "@/lib/levels";
import { STOCK_UNIVERSE } from "@/lib/stockUniverse";

interface Quote { c: number; d: number; dp: number; h: number; l: number; o: number; pc: number; }
interface Candle { time: Time; open: number; high: number; low: number; close: number; volume?: number; }
interface Position { symbol: string; quantity: number; avg_cost: number; }
interface Alert { id: string; symbol: string; price: number; line: IPriceLine; }
interface Drawing { id: string; type: "trend" | "hline" | "ruler" | "text"; line?: IPriceLine; }
interface WorkingOrder {
  id: string; symbol: string; side: "buy" | "sell"; order_type: "limit" | "stop";
  quantity: number; trigger_price: number; status: string;
}
type OrderType = "market" | "limit" | "stop";

const INTERVALS = ["1m", "5m", "15m", "1H", "4H", "1D", "1W", "1M"] as const;
const TIMEFRAMES: Record<string, typeof INTERVALS[number]> = {
  "1D": "5m", "5D": "15m", "1M": "1H", "3M": "1D",
  "6M": "1D", "YTD": "1D", "1Y": "1D", "5Y": "1W", "All": "1M",
};
const CHART_TYPES = ["candles", "bars", "line", "area"] as const;
type ChartType = typeof CHART_TYPES[number];
const INDICATORS = ["SMA20", "SMA50", "EMA20", "VOL", "RSI14"] as const;
type IndicatorKey = typeof INDICATORS[number];

// Polling cadence per interval (ms). Intraday refreshes faster.
const POLL_MS: Record<string, number> = {
  "1m": 5000, "5m": 10000, "15m": 15000, "1H": 30000,
  "4H": 60000, "1D": 30000, "1W": 60000, "1M": 60000,
};

const Trade = () => {
  const { user } = useAuth();
  const { start } = useSpotlight();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSymbol = (searchParams.get("symbol") || "AAPL").toUpperCase();
  const [symbol, setSymbol] = useState(initialSymbol);
  const [input, setInput] = useState(initialSymbol);

  // Sync state when ?symbol=... changes (e.g. user clicks a sidebar ticker).
  useEffect(() => {
    const s = (searchParams.get("symbol") || "").toUpperCase();
    if (s && s !== symbol) {
      setSymbol(s);
      setInput(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Reflect current symbol in URL so deep-links / back-button work.
  useEffect(() => {
    if (searchParams.get("symbol") !== symbol) {
      const next = new URLSearchParams(searchParams);
      next.set("symbol", symbol);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const [interval, setInterval] = useState<typeof INTERVALS[number]>("1D");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [cash, setCash] = useState(0);
  const [activeTool, setActiveTool] = useState<string>("cursor");
  const [bottomTab, setBottomTab] = useState("trading");
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [indicators, setIndicators] = useState<Record<IndicatorKey, boolean>>({
    SMA20: false, SMA50: false, EMA20: false, VOL: true, RSI14: false,
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertPrice, setAlertPrice] = useState("");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [magnetOn, setMagnetOn] = useState(true);
  const [locked, setLocked] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [screenerQuery, setScreenerQuery] = useState("");
  const trendStart = useRef<{ time: number; price: number } | null>(null);

  // Order ticket state
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [workingOrders, setWorkingOrders] = useState<WorkingOrder[]>([]);

  const chartRef = useRef<HTMLDivElement>(null);
  const chartApi = useRef<IChartApi | null>(null);
  const mainSeries = useRef<ISeriesApi<any> | null>(null);
  const indicatorSeries = useRef<Partial<Record<IndicatorKey, ISeriesApi<any>>>>({});
  const volSeries = useRef<ISeriesApi<"Histogram"> | null>(null);
  const rsiChartRef = useRef<HTMLDivElement>(null);
  const rsiChartApi = useRef<IChartApi | null>(null);
  const rsiSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiOver = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiUnder = useRef<ISeriesApi<"Line"> | null>(null);

  // ---------- Chart init ----------
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = createChart(chartRef.current, {
      layout: { background: { color: "transparent" }, textColor: "#8B95A7", fontFamily: "JetBrains Mono" },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
      width: chartRef.current.clientWidth,
      height: chartRef.current.clientHeight,
      handleScale: true,
      handleScroll: true,
    });
    chartApi.current = chart;
    const onResize = () => {
      if (!chartRef.current) return;
      chart.applyOptions({
        width: chartRef.current.clientWidth,
        height: chartRef.current.clientHeight,
      });
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(chartRef.current);
    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      chart.remove();
      chartApi.current = null;
      mainSeries.current = null;
      indicatorSeries.current = {};
    };
  }, []);

  // ---------- Build/rebuild main series when chart type changes ----------
  useEffect(() => {
    const chart = chartApi.current;
    if (!chart) return;
    if (mainSeries.current) {
      try { chart.removeSeries(mainSeries.current); } catch { /* */ }
      mainSeries.current = null;
    }
    let s: ISeriesApi<any>;
    if (chartType === "candles") {
      s = chart.addSeries(CandlestickSeries, {
        upColor: "#00C805", downColor: "#FF3B30",
        borderUpColor: "#00C805", borderDownColor: "#FF3B30",
        wickUpColor: "#00C805", wickDownColor: "#FF3B30",
      });
    } else if (chartType === "bars") {
      s = chart.addSeries(BarSeries, { upColor: "#00C805", downColor: "#FF3B30" });
    } else if (chartType === "line") {
      s = chart.addSeries(LineSeries, { color: "#00C805", lineWidth: 2 });
    } else {
      s = chart.addSeries(AreaSeries, {
        lineColor: "#00C805", topColor: "rgba(0,200,5,0.35)", bottomColor: "rgba(0,200,5,0)",
      });
    }
    mainSeries.current = s;
    pushDataToSeries(candles);
    // re-attach indicators
    rebuildIndicators(candles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType]);

  const pushDataToSeries = (data: Candle[]) => {
    const s = mainSeries.current;
    if (!s || !data.length) return;
    if (chartType === "line" || chartType === "area") {
      s.setData(data.map(d => ({ time: d.time, value: d.close })));
    } else {
      s.setData(data);
    }
    chartApi.current?.timeScale().fitContent();
    pushVolumeData(data);
    pushRsiData(data);
  };

  // ---------- Volume histogram (in-pane, 25% from bottom) ----------
  const ensureVolSeries = () => {
    const chart = chartApi.current;
    if (!chart) return null;
    if (volSeries.current) return volSeries.current;
    const s = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      color: "#00C805",
    });
    s.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    volSeries.current = s;
    return s;
  };
  const pushVolumeData = (data: Candle[]) => {
    if (!indicators.VOL) {
      if (volSeries.current && chartApi.current) {
        try { chartApi.current.removeSeries(volSeries.current); } catch { /* */ }
        volSeries.current = null;
      }
      return;
    }
    const s = ensureVolSeries();
    if (!s) return;
    s.setData(data.map(d => ({
      time: d.time,
      value: d.volume ?? 0,
      color: d.close >= d.open ? "rgba(0,200,5,0.55)" : "rgba(255,59,48,0.55)",
    })));
  };

  // ---------- RSI(14) sub-pane ----------
  const computeRsi = (data: Candle[], period = 14) => {
    if (data.length <= period) return [] as Array<{ time: Time; value: number }>;
    const out: Array<{ time: Time; value: number }> = [];
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
      const ch = data[i].close - data[i - 1].close;
      if (ch >= 0) gain += ch; else loss -= ch;
    }
    let avgGain = gain / period;
    let avgLoss = loss / period;
    const rs0 = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out.push({ time: data[period].time, value: 100 - 100 / (1 + rs0) });
    for (let i = period + 1; i < data.length; i++) {
      const ch = data[i].close - data[i - 1].close;
      const g = ch > 0 ? ch : 0;
      const l = ch < 0 ? -ch : 0;
      avgGain = (avgGain * (period - 1) + g) / period;
      avgLoss = (avgLoss * (period - 1) + l) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      out.push({ time: data[i].time, value: 100 - 100 / (1 + rs) });
    }
    return out;
  };

  const pushRsiData = (data: Candle[]) => {
    if (!indicators.RSI14 || !rsiChartApi.current) return;
    const series = rsiSeries.current;
    if (!series) return;
    const values = computeRsi(data, 14);
    series.setData(values);
    if (values.length) {
      rsiOver.current?.setData(values.map(v => ({ time: v.time, value: 70 })));
      rsiUnder.current?.setData(values.map(v => ({ time: v.time, value: 30 })));
    }
    rsiChartApi.current.timeScale().fitContent();
  };

  // Sync RSI pane time scale with main chart pan/zoom
  useEffect(() => {
    const main = chartApi.current;
    const rsi = rsiChartApi.current;
    if (!main || !rsi) return;
    const sync = () => {
      const r = main.timeScale().getVisibleLogicalRange();
      if (r) rsi.timeScale().setVisibleLogicalRange(r);
    };
    main.timeScale().subscribeVisibleLogicalRangeChange(sync);
    return () => { try { main.timeScale().unsubscribeVisibleLogicalRangeChange(sync); } catch { /* */ } };
  }, [indicators.RSI14]);

  // Init / teardown RSI sub-chart when toggled
  useEffect(() => {
    if (!indicators.RSI14) {
      if (rsiChartApi.current) {
        try { rsiChartApi.current.remove(); } catch { /* */ }
        rsiChartApi.current = null;
        rsiSeries.current = null;
        rsiOver.current = null;
        rsiUnder.current = null;
      }
      return;
    }
    const el = rsiChartRef.current;
    if (!el || rsiChartApi.current) return;
    const c = createChart(el, {
      layout: { background: { color: "transparent" }, textColor: "#8B95A7", fontFamily: "JetBrains Mono" },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
      width: el.clientWidth,
      height: el.clientHeight,
    });
    rsiChartApi.current = c;
    const s = c.addSeries(LineSeries, { color: "#B266FF", lineWidth: 2 });
    const over = c.addSeries(LineSeries, { color: "rgba(255,59,48,0.5)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const under = c.addSeries(LineSeries, { color: "rgba(0,200,5,0.5)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    rsiSeries.current = s;
    rsiOver.current = over;
    rsiUnder.current = under;
    pushRsiData(candles);
    const ro = new ResizeObserver(() => { c.applyOptions({ width: el.clientWidth, height: el.clientHeight }); });
    ro.observe(el);
    return () => { ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.RSI14]);

  // ---------- Indicators ----------
  const sma = (data: Candle[], period: number) => {
    const out: Array<{ time: Time; value: number }> = [];
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += data[i - j].close;
      out.push({ time: data[i].time, value: sum / period });
    }
    return out;
  };
  const ema = (data: Candle[], period: number) => {
    const out: Array<{ time: Time; value: number }> = [];
    const k = 2 / (period + 1);
    let prev = data[0]?.close ?? 0;
    for (let i = 0; i < data.length; i++) {
      prev = i === 0 ? data[i].close : data[i].close * k + prev * (1 - k);
      if (i >= period - 1) out.push({ time: data[i].time, value: prev });
    }
    return out;
  };

  const rebuildIndicators = useCallback((data: Candle[]) => {
    const chart = chartApi.current;
    if (!chart) return;
    (Object.keys(indicatorSeries.current) as IndicatorKey[]).forEach(k => {
      const s = indicatorSeries.current[k];
      if (s) try { chart.removeSeries(s); } catch { /* */ }
    });
    indicatorSeries.current = {};
    if (!data.length) return;
    if (indicators.SMA20) {
      const s = chart.addSeries(LineSeries, { color: "#00C805", lineWidth: 1, priceLineVisible: false });
      s.setData(sma(data, 20));
      indicatorSeries.current.SMA20 = s;
    }
    if (indicators.SMA50) {
      const s = chart.addSeries(LineSeries, { color: "#FFB800", lineWidth: 1, priceLineVisible: false });
      s.setData(sma(data, 50));
      indicatorSeries.current.SMA50 = s;
    }
    if (indicators.EMA20) {
      const s = chart.addSeries(LineSeries, { color: "#00B7FF", lineWidth: 1, priceLineVisible: false });
      s.setData(ema(data, 20));
      indicatorSeries.current.EMA20 = s;
    }
  }, [indicators]);

  useEffect(() => { rebuildIndicators(candles); }, [indicators, candles, rebuildIndicators]);
  useEffect(() => { pushVolumeData(candles); }, [indicators.VOL, candles]);
  useEffect(() => { pushRsiData(candles); }, [indicators.RSI14, candles]);

  // ---------- Profile cash ----------
  const refreshCash = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("paper_cash").eq("id", user.id).maybeSingle();
    if (data) setCash(Number(data.paper_cash));
  }, [user]);

  const refreshPositions = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("portfolios").select("symbol, quantity, avg_cost").eq("user_id", user.id);
    if (data) setPositions(data.map(p => ({ symbol: p.symbol, quantity: Number(p.quantity), avg_cost: Number(p.avg_cost) })));
  }, [user]);

  useEffect(() => { refreshCash(); refreshPositions(); }, [refreshCash, refreshPositions]);

  // ---------- Working orders (Limit / Stop-Loss) ----------
  const refreshWorkingOrders = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("working_orders").select("*")
      .eq("user_id", user.id).eq("status", "open")
      .order("created_at", { ascending: false });
    if (data) setWorkingOrders(data.map(o => ({
      id: o.id, symbol: o.symbol, side: o.side as "buy" | "sell",
      order_type: o.order_type as "limit" | "stop",
      quantity: Number(o.quantity), trigger_price: Number(o.trigger_price), status: o.status,
    })));
  }, [user]);
  useEffect(() => { refreshWorkingOrders(); }, [refreshWorkingOrders]);

  // ---------- Quote + candles (with live polling) ----------
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchOnce = async (initial: boolean) => {
      if (initial) setLoadingQuote(true);
      try {
        const { data, error } = await supabase.functions.invoke("market-quote", { body: { symbol, interval } });
        if (cancelled) return;
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const newQuote = data?.quote as Quote | undefined;
        const newCandles = data?.candles as Candle[] | undefined;

        if (newQuote) setQuote(newQuote);

        if (initial && newCandles?.length) {
          // First load: replace the whole series.
          setCandles(newCandles);
          pushDataToSeries(newCandles);
        } else if (newCandles?.length) {
          // Live update: merge most recent candle(s) so the chart actually moves.
          setCandles(prev => {
            if (!prev.length) {
              pushDataToSeries(newCandles);
              return newCandles;
            }
            const merged = [...prev];
            const lastTime = Number(merged[merged.length - 1].time);
            const incoming = newCandles.slice(-3); // tail is enough
            for (const c of incoming) {
              const t = Number(c.time);
              if (t < lastTime) continue;
              if (t === lastTime) {
                merged[merged.length - 1] = c;
                mainSeries.current?.update(
                  chartType === "line" || chartType === "area"
                    ? { time: c.time, value: c.close } as any
                    : c as any
                );
              } else {
                merged.push(c);
                mainSeries.current?.update(
                  chartType === "line" || chartType === "area"
                    ? { time: c.time, value: c.close } as any
                    : c as any
                );
              }
            }
            return merged;
          });
        } else if (newQuote) {
          // No candle data, but we have a fresh price — nudge the last bar's close.
          setCandles(prev => {
            if (!prev.length) return prev;
            const merged = [...prev];
            const last = { ...merged[merged.length - 1] };
            last.close = newQuote.c;
            last.high = Math.max(last.high, newQuote.c);
            last.low = Math.min(last.low, newQuote.c);
            merged[merged.length - 1] = last;
            mainSeries.current?.update(
              chartType === "line" || chartType === "area"
                ? { time: last.time, value: last.close } as any
                : last as any
            );
            return merged;
          });
        }
      } catch (e) {
        if (initial && !cancelled) toast.error(e instanceof Error ? e.message : "Failed to load market data");
      } finally {
        if (initial && !cancelled) setLoadingQuote(false);
      }
    };

    const loop = async () => {
      await fetchOnce(false);
      if (cancelled) return;
      timer = setTimeout(loop, POLL_MS[interval] ?? 15000);
    };

    fetchOnce(true).then(() => {
      if (cancelled) return;
      timer = setTimeout(loop, POLL_MS[interval] ?? 15000);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval]);

  // ---------- Drawing tool: chart click handler ----------
  useEffect(() => {
    const chart = chartApi.current;
    const s = mainSeries.current;
    if (!chart || !s) return;
    const handler = (param: MouseEventParams) => {
      if (locked || hidden) return;
      if (!param.point || !param.time) return;
      const price = s.coordinateToPrice(param.point.y);
      if (price == null) return;

      if (activeTool === "hline" || activeTool === "line") {
        const line = s.createPriceLine({
          price: Number(price),
          color: "#00C805",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `H ${Number(price).toFixed(2)}`,
        });
        const id = crypto.randomUUID();
        setDrawings(d => [...d, { id, type: "hline", line }]);
        toast.success(`Horizontal line at ${Number(price).toFixed(2)}`);
        setActiveTool("cursor");
      } else if (activeTool === "trend") {
        if (!trendStart.current) {
          trendStart.current = { time: Number(param.time), price: Number(price) };
          toast("Pick the second point of the trend line");
        } else {
          const a = trendStart.current;
          const b = { time: Number(param.time), price: Number(price) };
          const mid = (a.price + b.price) / 2;
          const line = s.createPriceLine({
            price: mid,
            color: "#00B7FF",
            lineWidth: 1,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: `Trend ${a.price.toFixed(2)}→${b.price.toFixed(2)}`,
          });
          const id = crypto.randomUUID();
          setDrawings(d => [...d, { id, type: "trend", line }]);
          trendStart.current = null;
          toast.success("Trend line drawn");
          setActiveTool("cursor");
        }
      } else if (activeTool === "ruler") {
        if (!trendStart.current) {
          trendStart.current = { time: Number(param.time), price: Number(price) };
          toast("Pick the second point to measure");
        } else {
          const a = trendStart.current;
          const b = { time: Number(param.time), price: Number(price) };
          const dPrice = b.price - a.price;
          const dPct = (dPrice / a.price) * 100;
          const dBars = Math.abs(b.time - a.time);
          toast.success(`Δ ${dPrice.toFixed(2)} (${dPct.toFixed(2)}%) · ${Math.round(dBars / 86400)}d`);
          trendStart.current = null;
          setActiveTool("cursor");
        }
      } else if (activeTool === "text") {
        const note = window.prompt("Annotation text:");
        if (note) {
          const line = s.createPriceLine({
            price: Number(price),
            color: "#FFB800",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: note.slice(0, 40),
          });
          const id = crypto.randomUUID();
          setDrawings(d => [...d, { id, type: "text", line }]);
        }
        setActiveTool("cursor");
      }
    };
    chart.subscribeClick(handler);
    return () => { chart.unsubscribeClick(handler); };
  }, [activeTool, locked, hidden]);

  // ---------- Apply hidden / locked ----------
  useEffect(() => {
    const chart = chartApi.current;
    if (!chart) return;
    chart.applyOptions({
      handleScale: !locked,
      handleScroll: !locked,
      crosshair: { mode: hidden ? 0 : 1 },
    });
  }, [locked, hidden]);

  // ---------- Alert lines: auto-trigger when price crosses ----------
  useEffect(() => {
    if (!quote) return;
    setAlerts(prev => prev.filter(a => {
      const triggered = (quote.c >= a.price && quote.pc < a.price) || (quote.c <= a.price && quote.pc > a.price);
      if (triggered) {
        toast.success(`Alert: ${a.symbol} crossed ${fmtUSD(a.price)}`);
        try { mainSeries.current?.removePriceLine(a.line); } catch { /* */ }
        return false;
      }
      return true;
    }));
  }, [quote]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const s = input.trim().toUpperCase();
    if (s) setSymbol(s);
  };

  // Execute a market fill at the given price (used by market orders + working-order fills)
  const executeFill = useCallback(async (
    fillSymbol: string, fillSide: "buy" | "sell", fillQty: number, fillPrice: number,
  ) => {
    if (!user) throw new Error("Not signed in");
    const cost = fillQty * fillPrice;
      const { error: tradeErr } = await supabase.from("trades").insert({
        user_id: user.id, symbol: fillSymbol, side: fillSide, quantity: fillQty, price: fillPrice,
      });
      if (tradeErr) throw tradeErr;
      const { data: existing } = await supabase
        .from("portfolios").select("quantity, avg_cost")
        .eq("user_id", user.id).eq("symbol", fillSymbol).maybeSingle();
      if (fillSide === "buy") {
        if (existing) {
          const newQty = Number(existing.quantity) + fillQty;
          const newAvg = (Number(existing.quantity) * Number(existing.avg_cost) + cost) / newQty;
          await supabase.from("portfolios").update({ quantity: newQty, avg_cost: newAvg })
            .eq("user_id", user.id).eq("symbol", fillSymbol);
        } else {
          await supabase.from("portfolios").insert({ user_id: user.id, symbol: fillSymbol, quantity: fillQty, avg_cost: fillPrice });
        }
        const { data: cur } = await supabase.from("profiles").select("paper_cash").eq("id", user.id).maybeSingle();
        await supabase.from("profiles").update({ paper_cash: Number(cur?.paper_cash ?? 0) - cost }).eq("id", user.id);
      } else {
        if (!existing || Number(existing.quantity) < fillQty) throw new Error("Not enough shares to sell");
        const newQty = Number(existing.quantity) - fillQty;
        if (newQty === 0) {
          await supabase.from("portfolios").delete().eq("user_id", user.id).eq("symbol", fillSymbol);
        } else {
          await supabase.from("portfolios").update({ quantity: newQty })
            .eq("user_id", user.id).eq("symbol", fillSymbol);
        }
        const { data: cur } = await supabase.from("profiles").select("paper_cash").eq("id", user.id).maybeSingle();
        await supabase.from("profiles").update({ paper_cash: Number(cur?.paper_cash ?? 0) + cost }).eq("id", user.id);
      }
      const action = fillSide === "buy" ? "Bought" : "Sold";
      toast.success(
        `${action} ${fillQty} ${fillSymbol} @ ${fmtUSD(fillPrice)} · Total ${fmtUSD(cost)}`
      );
      await refreshCash();
      await refreshPositions();
  }, [user, refreshCash, refreshPositions]);

  const placeOrder = async () => {
    if (!user || !quote) return;
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) return toast.error("Enter a valid quantity");
    setSubmitting(true);
    try {
      if (orderType === "market") {
        const price = quote.c;
        if (side === "buy" && q * price > cash) throw new Error("Insufficient cash");
        await executeFill(symbol, side, q, price);
      } else {
        const trigger = Number(orderType === "limit" ? limitPrice : stopPrice);
        if (!Number.isFinite(trigger) || trigger <= 0) throw new Error("Enter a valid trigger price");
        // Reserve cash check for buy-limit so user knows up front
        if (side === "buy" && q * trigger > cash) throw new Error("Insufficient cash for buy-limit at this price");
        const { error } = await supabase.from("working_orders").insert({
          user_id: user.id, symbol, side, order_type: orderType,
          quantity: q, trigger_price: trigger, status: "open",
        });
        if (error) throw error;
        toast.success(
          `${orderType === "limit" ? "Limit" : "Stop-Loss"} ${side.toUpperCase()} queued · ${q} ${symbol} @ ${fmtUSD(trigger)}`
        );
        if (orderType === "limit") setLimitPrice(""); else setStopPrice("");
        await refreshWorkingOrders();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Order failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Working-order watcher: every time a quote tick arrives for the active symbol,
  // check if any open order's trigger has been crossed and fill it.
  useEffect(() => {
    if (!quote || !workingOrders.length) return;
    const eligible = workingOrders.filter(o => o.symbol === symbol);
    if (!eligible.length) return;
    const price = quote.c;
    const prev = quote.pc;
    (async () => {
      for (const o of eligible) {
        let triggered = false;
        // Limit Buy: fill when price <= limit. Limit Sell: fill when price >= limit.
        // Stop Sell (stop-loss long): fill when price <= stop. Stop Buy (stop-buy): fill when price >= stop.
        if (o.order_type === "limit") {
          if (o.side === "buy" && price <= o.trigger_price) triggered = true;
          if (o.side === "sell" && price >= o.trigger_price) triggered = true;
        } else { // stop
          if (o.side === "sell" && price <= o.trigger_price && prev > o.trigger_price) triggered = true;
          if (o.side === "buy" && price >= o.trigger_price && prev < o.trigger_price) triggered = true;
        }
        if (!triggered) continue;
        try {
          // Atomic-ish: mark filled first to prevent double-fill if effect re-runs
          const { data: claimed } = await supabase
            .from("working_orders")
            .update({ status: "filled", filled_at: new Date().toISOString(), fill_price: price })
            .eq("id", o.id).eq("status", "open").select("id").maybeSingle();
          if (!claimed) continue;
          await executeFill(o.symbol, o.side, o.quantity, price);
          toast.success(`${o.order_type.toUpperCase()} filled · ${o.symbol}`, { duration: 5000 });
        } catch (e) {
          toast.error(`Auto-fill failed: ${e instanceof Error ? e.message : "unknown"}`);
        }
      }
      refreshWorkingOrders();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote]);

  const cancelWorkingOrder = async (id: string) => {
    const { error } = await supabase.from("working_orders")
      .update({ status: "cancelled" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Order cancelled");
    refreshWorkingOrders();
  };

  const addAlert = () => {
    const p = Number(alertPrice);
    if (!Number.isFinite(p) || p <= 0) return toast.error("Enter a valid price");
    if (!mainSeries.current) return;
    const line = mainSeries.current.createPriceLine({
      price: p, color: "#FFB800", lineWidth: 1, lineStyle: LineStyle.Dashed,
      axisLabelVisible: true, title: `Alert ${p.toFixed(2)}`,
    });
    setAlerts(a => [...a, { id: crypto.randomUUID(), symbol, price: p, line }]);
    toast.success(`Alert set at ${fmtUSD(p)}`);
    setAlertPrice("");
    setAlertOpen(false);
  };

  const clearDrawings = () => {
    const s = mainSeries.current;
    if (!s) return;
    drawings.forEach(d => { if (d.line) try { s.removePriceLine(d.line); } catch { /* */ } });
    setDrawings([]);
    toast("Drawings cleared");
    setActiveTool("cursor");
  };

  const snapshot = async () => {
    const node = chartRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!node) return toast.error("Chart not ready");
    try {
      const dataUrl = node.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${symbol}-${interval}-${Date.now()}.png`;
      a.click();
      toast.success("Snapshot saved");
    } catch {
      toast.error("Snapshot blocked by browser");
    }
  };

  const handleTimeframe = (tf: string) => {
    const iv = TIMEFRAMES[tf];
    if (iv) setInterval(iv);
  };

  return (
    <div className="-m-4 md:-m-6 h-[calc(100vh-3rem)] flex flex-col bg-background text-foreground select-none">
      {/* TOP TOOLBAR */}
      <div
        className="flex items-center gap-1 px-2 h-10 border-b border-border bg-card/40 shrink-0 overflow-x-auto"
        data-spotlight="trade-toolbar"
      >
        <form onSubmit={search} className="flex items-center gap-1 shrink-0">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              className="h-7 w-32 pl-7 font-mono text-xs bg-background border-border"
              placeholder="Symbol"
              maxLength={10}
            />
          </div>
          <button type="submit" title="Load symbol" className="h-7 w-7 flex items-center justify-center hover:bg-secondary text-muted-foreground border border-border">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </form>
        <Sep />
        {INTERVALS.map((iv) => (
          <button
            key={iv}
            onClick={() => setInterval(iv)}
            className={`h-7 px-2 text-[11px] font-mono ${
              interval === iv ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            {iv}
          </button>
        ))}
        <Sep />

        {/* Chart type */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button title="Chart type" className="h-7 px-2 flex items-center gap-1 text-muted-foreground hover:text-foreground hover:bg-secondary text-[11px] font-mono shrink-0">
              {chartType === "candles" ? <CandlestickChart className="h-3.5 w-3.5" /> :
               chartType === "bars" ? <BarChart3 className="h-3.5 w-3.5" /> :
               chartType === "line" ? <LineChartIcon className="h-3.5 w-3.5" /> :
               <Activity className="h-3.5 w-3.5" />}
              <span className="capitalize">{chartType}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Chart type</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {CHART_TYPES.map(t => (
              <DropdownMenuItem key={t} onClick={() => setChartType(t)} className="capitalize text-xs font-mono">
                {t === chartType ? "✓ " : "  "}{t}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Indicators */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button title="Indicators" className="h-7 px-2 flex items-center gap-1 text-muted-foreground hover:text-foreground hover:bg-secondary text-[11px] font-mono shrink-0">
              <Activity className="h-3.5 w-3.5" /> Indicators
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Studies</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {INDICATORS.map(k => (
              <DropdownMenuCheckboxItem
                key={k}
                checked={indicators[k]}
                onCheckedChange={(v) => setIndicators(s => ({ ...s, [k]: !!v }))}
                className="text-xs font-mono"
              >
                {k}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <ToolbarBtn icon={Layers} label="Compare" onClick={() => toast("Compare panel — pick two symbols from your watchlist")} />

        <Sep />

        {/* Alert */}
        <Dialog open={alertOpen} onOpenChange={setAlertOpen}>
          <DialogTrigger asChild>
            <button title="Set price alert" className="h-7 px-2 flex items-center gap-1 text-muted-foreground hover:text-foreground hover:bg-secondary text-[11px] font-mono shrink-0">
              <Bell className="h-3.5 w-3.5" /> Alert
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New price alert · {symbol}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Trigger price</Label>
              <Input
                type="number" step="0.01"
                value={alertPrice}
                onChange={(e) => setAlertPrice(e.target.value)}
                placeholder={quote ? quote.c.toFixed(2) : ""}
                className="font-mono"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground font-mono">
                Fires once when {symbol} crosses this price.
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAlertOpen(false)}>Cancel</Button>
              <Button onClick={addAlert}>Set alert</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => start(tradeTour)}
        >
          <HelpCircle className="h-3.5 w-3.5 mr-1" /> Tour
        </Button>
        <ToolbarBtn icon={Settings2} label="Settings" onClick={() => toast("Chart settings — coming up")} />
        <ToolbarBtn icon={Camera} label="Snapshot chart" onClick={snapshot} />
      </div>

      {/* MAIN LAYOUT */}
      <div className="flex flex-1 min-h-0">
        {/* LEFT TOOL RAIL */}
        <div
          className="w-10 border-r border-border bg-card/30 flex flex-col items-center py-2 gap-0.5 shrink-0"
          data-spotlight="trade-tools"
        >
          <ToolBtn id="cursor" title="Cursor" icon={MousePointer2} active={activeTool === "cursor"} onClick={() => setActiveTool("cursor")} />
          <ToolBtn id="cross" title="Crosshair" icon={Crosshair} active={activeTool === "cross"} onClick={() => setActiveTool("cross")} />
          <ToolBtn id="trend" title="Trend line (2 clicks)" icon={TrendIcon} active={activeTool === "trend"} onClick={() => { trendStart.current = null; setActiveTool("trend"); }} />
          <ToolBtn id="hline" title="Horizontal line" icon={Minus} active={activeTool === "hline"} onClick={() => setActiveTool("hline")} />
          <ToolBtn id="text" title="Annotation" icon={Type} active={activeTool === "text"} onClick={() => setActiveTool("text")} />
          <ToolBtn id="ruler" title="Measure (2 clicks)" icon={Ruler} active={activeTool === "ruler"} onClick={() => { trendStart.current = null; setActiveTool("ruler"); }} />
          <ToolBtn id="bars" title="Bar chart" icon={BarChart3} active={chartType === "bars"} onClick={() => setChartType("bars")} />
          <ToolBtn id="line2" title="Line chart" icon={LineChartIcon} active={chartType === "line"} onClick={() => setChartType("line")} />
          <div className="flex-1" />
          <ToolBtn id="magnet" title="Toggle magnet" icon={Magnet} active={magnetOn} onClick={() => { setMagnetOn(m => !m); toast(magnetOn ? "Magnet off" : "Magnet on"); }} />
          <ToolBtn id="lock" title="Lock chart" icon={Lock} active={locked} onClick={() => setLocked(l => !l)} />
          <ToolBtn id="eye" title="Hide drawings" icon={Eye} active={!hidden} onClick={() => setHidden(h => !h)} />
          <ToolBtn id="erase" title="Clear drawings" icon={Eraser} active={false} onClick={clearDrawings} />
        </div>

        {/* CHART AREA + RIGHT */}
        <div className="flex-1 flex min-w-0">
          <div className="flex-1 flex flex-col min-w-0">
            {/* SYMBOL HEADER STRIP */}
            <div className="px-3 py-1.5 border-b border-border bg-card/20 flex items-center gap-4 text-xs font-mono shrink-0 overflow-x-auto">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">{symbol}</span>
                <span className="text-muted-foreground">· {interval} · NASDAQ</span>
              </div>
              {quote ? (
                <>
                  <span className="tabular-nums text-sm font-semibold">{fmtUSD(quote.c)}</span>
                  <span className={quote.d >= 0 ? "text-gain" : "text-loss"}>
                    {quote.d >= 0 ? "+" : ""}{quote.d.toFixed(2)} ({fmtPct(quote.dp / 100)})
                    {quote.d >= 0
                      ? <TrendingUp className="h-3 w-3 inline ml-1" />
                      : <TrendingDown className="h-3 w-3 inline ml-1" />}
                  </span>
                  <Sep />
                  <Stat label="O" value={quote.o.toFixed(2)} />
                  <Stat label="H" value={quote.h.toFixed(2)} tone="gain" />
                  <Stat label="L" value={quote.l.toFixed(2)} tone="loss" />
                  <Stat label="C" value={quote.c.toFixed(2)} />
                </>
              ) : loadingQuote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {activeTool !== "cursor" && (
                <span className="ml-auto text-[10px] uppercase tracking-wider text-primary">
                  Tool: {activeTool} {trendStart.current ? "(pick 2nd)" : ""}
                </span>
              )}
            </div>

            {/* CHART */}
            <div className="flex-1 min-h-0 flex flex-col" data-spotlight="trade-chart">
              <div className="flex-1 min-h-0 relative">
                <div ref={chartRef} className="absolute inset-0" />
              {loadingQuote && !candles.length && (
                <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading {symbol}…
                </div>
              )}
              {!loadingQuote && !candles.length && (
                <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-muted-foreground">
                  No data for {symbol}
                </div>
              )}
              </div>
              {indicators.RSI14 && (
                <div className="h-32 border-t border-border relative shrink-0">
                  <div className="absolute top-1 left-2 z-10 text-[10px] font-mono text-muted-foreground uppercase tracking-wider pointer-events-none">
                    RSI(14) · 30 / 70
                  </div>
                  <div ref={rsiChartRef} className="absolute inset-0" />
                </div>
              )}
            </div>

            {/* TIMEFRAME STRIP */}
            <div className="h-8 border-t border-border bg-card/30 flex items-center px-2 gap-0.5 shrink-0">
              {Object.keys(TIMEFRAMES).map((tf) => (
                <button
                  key={tf}
                  onClick={() => handleTimeframe(tf)}
                  className="h-6 px-2 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-secondary"
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* RIGHT ACTION RAIL */}
          <div className="w-9 border-l border-border bg-card/30 flex flex-col items-center py-2 gap-0.5 shrink-0">
            <ToolBtn id="watchlist" title="Watchlist" icon={Eye} active={false} onClick={() => setBottomTab("positions")} />
            <ToolBtn id="alerts" title="Alerts" icon={Bell} active={false} onClick={() => setAlertOpen(true)} />
            <ToolBtn id="layers" title="Layers" icon={Layers} active={false} onClick={() => toast("Layers panel — coming up")} />
            <ToolBtn id="settings" title="Settings" icon={Settings2} active={false} onClick={() => toast("Settings — coming up")} />
          </div>
        </div>
      </div>

      {/* BOTTOM PANEL */}
      <div className="border-t border-border bg-card/40 shrink-0" data-spotlight="trade-panel">
        <Tabs value={bottomTab} onValueChange={setBottomTab}>
          <TabsList className="h-8 bg-transparent border-b border-border w-full justify-start gap-0 px-2">
            <TabsTrigger value="trading" className="h-7 text-xs data-[state=active]:bg-secondary data-[state=active]:text-primary">Trading Panel</TabsTrigger>
            <TabsTrigger value="orderbook" className="h-7 text-xs data-[state=active]:bg-secondary data-[state=active]:text-primary">Order Book</TabsTrigger>
            <TabsTrigger value="positions" className="h-7 text-xs data-[state=active]:bg-secondary data-[state=active]:text-primary">Positions</TabsTrigger>
            <TabsTrigger value="working" className="h-7 text-xs data-[state=active]:bg-secondary data-[state=active]:text-primary">Working ({workingOrders.length})</TabsTrigger>
            <TabsTrigger value="alerts" className="h-7 text-xs data-[state=active]:bg-secondary data-[state=active]:text-primary">Alerts ({alerts.length})</TabsTrigger>
            <TabsTrigger value="screener" className="h-7 text-xs data-[state=active]:bg-secondary data-[state=active]:text-primary">Screener</TabsTrigger>
            <div className="flex-1" />
            <div className="text-[11px] font-mono text-muted-foreground pr-2">
              Cash: <span className="text-foreground">{fmtUSD(cash)}</span>
            </div>
          </TabsList>

          <TabsContent value="trading" className="m-0 p-3 max-h-72 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-[1fr,1fr,1fr,1fr] gap-3 max-w-5xl">
              <div className="space-y-2">
                <Label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Side</Label>
                <Tabs value={side} onValueChange={(v) => setSide(v as "buy" | "sell")}>
                  <TabsList className="grid grid-cols-2 w-full h-8">
                    <TabsTrigger value="buy" className="h-7 text-xs data-[state=active]:bg-gain data-[state=active]:text-gain-foreground">Buy</TabsTrigger>
                    <TabsTrigger value="sell" className="h-7 text-xs data-[state=active]:bg-loss data-[state=active]:text-loss-foreground">Sell</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Order type</Label>
                <Tabs value={orderType} onValueChange={(v) => setOrderType(v as OrderType)}>
                  <TabsList className="grid grid-cols-3 w-full h-8">
                    <TabsTrigger value="market" className="h-7 text-[11px] font-mono data-[state=active]:bg-primary/15 data-[state=active]:text-primary">Market</TabsTrigger>
                    <TabsTrigger value="limit" className="h-7 text-[11px] font-mono data-[state=active]:bg-primary/15 data-[state=active]:text-primary">Limit</TabsTrigger>
                    <TabsTrigger value="stop" className="h-7 text-[11px] font-mono data-[state=active]:bg-primary/15 data-[state=active]:text-primary">Stop</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Quantity</Label>
                <Input
                  type="number" min="0" step="1"
                  value={qty} onChange={(e) => setQty(e.target.value)}
                  className="h-8 font-mono text-xs"
                />
              </div>
              {orderType === "market" && (
                <div className="space-y-2">
                  <Label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Estimated total</Label>
                  <div className="h-8 px-2 flex items-center font-mono text-xs bg-secondary border border-border tabular-nums">
                    {quote ? fmtUSD((Number(qty) || 0) * quote.c) : "—"}
                  </div>
                </div>
              )}
              {orderType === "limit" && (
                <div className="space-y-2">
                  <Label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Target price · fills when {side === "buy" ? "≤" : "≥"}
                  </Label>
                  <Input
                    type="number" min="0" step="0.01"
                    value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)}
                    placeholder={quote ? quote.c.toFixed(2) : ""}
                    className="h-8 font-mono text-xs"
                  />
                </div>
              )}
              {orderType === "stop" && (
                <div className="space-y-2">
                  <Label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Trigger price · {side === "sell" ? "exit if drops to" : "buy if breaks above"}
                  </Label>
                  <Input
                    type="number" min="0" step="0.01"
                    value={stopPrice} onChange={(e) => setStopPrice(e.target.value)}
                    placeholder={quote ? quote.c.toFixed(2) : ""}
                    className="h-8 font-mono text-xs"
                  />
                </div>
              )}
              <Button
                onClick={placeOrder}
                disabled={submitting || !quote}
                className={`md:col-span-4 h-9 rounded-none ${side === "buy" ? "bg-gain text-gain-foreground hover:bg-gain/90" : "bg-loss text-loss-foreground hover:bg-loss/90"}`}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {orderType === "market"
                  ? `${side === "buy" ? "Buy" : "Sell"} ${qty} ${symbol} @ Market`
                  : orderType === "limit"
                    ? `Place LIMIT ${side.toUpperCase()} · ${qty} ${symbol} @ ${limitPrice || "—"}`
                    : `Place STOP ${side.toUpperCase()} · ${qty} ${symbol} @ ${stopPrice || "—"}`}
              </Button>
              {orderType !== "market" && (
                <p className="md:col-span-4 text-[10px] font-mono text-muted-foreground">
                  Working orders persist across sessions. They auto-fill the moment the market crosses your trigger price while this symbol is being polled.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="working" className="m-0 p-3 max-h-56 overflow-y-auto">
            {workingOrders.length === 0 ? (
              <p className="text-xs text-muted-foreground font-mono">No pending orders. Place a Limit or Stop-Loss to queue one.</p>
            ) : (
              <table className="w-full text-xs font-mono">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left py-1">Symbol</th>
                    <th className="text-left">Type</th>
                    <th className="text-left">Side</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Trigger</th>
                    <th className="text-right">Mark</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {workingOrders.map(o => {
                    const mark = o.symbol === symbol && quote ? quote.c : null;
                    return (
                      <tr key={o.id} className="border-b border-border/40 hover:bg-secondary/40">
                        <td className="py-1">
                          <button onClick={() => { setInput(o.symbol); setSymbol(o.symbol); }} className="text-primary hover:underline">{o.symbol}</button>
                        </td>
                        <td className="uppercase">{o.order_type}</td>
                        <td className={o.side === "buy" ? "text-gain" : "text-loss"}>{o.side.toUpperCase()}</td>
                        <td className="text-right tabular-nums">{o.quantity}</td>
                        <td className="text-right tabular-nums">{fmtUSD(o.trigger_price)}</td>
                        <td className="text-right tabular-nums">{mark ? fmtUSD(mark) : "—"}</td>
                        <td className="text-right">
                          <button onClick={() => cancelWorkingOrder(o.id)} className="text-muted-foreground hover:text-loss" title="Cancel">
                            <X className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </TabsContent>

          <TabsContent value="orderbook" className="m-0 p-3 max-h-56 overflow-y-auto">
            {quote ? <OrderBook price={quote.c} /> : <p className="text-xs text-muted-foreground">Awaiting quote…</p>}
          </TabsContent>

          <TabsContent value="positions" className="m-0 p-3 max-h-56 overflow-y-auto">
            {positions.length === 0 ? (
              <p className="text-xs text-muted-foreground font-mono">No open positions. Buy something to start your blotter.</p>
            ) : (
              <table className="w-full text-xs font-mono">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left py-1">Symbol</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Avg Cost</th>
                    <th className="text-right">Mark</th>
                    <th className="text-right">P/L</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map(p => {
                    const mark = p.symbol === symbol && quote ? quote.c : p.avg_cost;
                    const pnl = (mark - p.avg_cost) * p.quantity;
                    return (
                      <tr key={p.symbol} className="border-b border-border/40 hover:bg-secondary/40">
                        <td className="py-1">
                          <button onClick={() => { setInput(p.symbol); setSymbol(p.symbol); }} className="text-primary hover:underline">{p.symbol}</button>
                        </td>
                        <td className="text-right tabular-nums">{p.quantity}</td>
                        <td className="text-right tabular-nums">{fmtUSD(p.avg_cost)}</td>
                        <td className="text-right tabular-nums">{fmtUSD(mark)}</td>
                        <td className={`text-right tabular-nums ${pnl >= 0 ? "text-gain" : "text-loss"}`}>{pnl >= 0 ? "+" : ""}{fmtUSD(pnl)}</td>
                        <td></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </TabsContent>

          <TabsContent value="alerts" className="m-0 p-3 max-h-56 overflow-y-auto">
            {alerts.length === 0 ? (
              <p className="text-xs text-muted-foreground font-mono">No active alerts. Use the bell icon in the toolbar to add one.</p>
            ) : (
              <ul className="space-y-1 text-xs font-mono">
                {alerts.map(a => (
                  <li key={a.id} className="flex items-center gap-2 px-2 py-1 bg-secondary/40 border border-border">
                    <Bell className="h-3 w-3 text-primary" />
                    <span>{a.symbol}</span>
                    <span className="text-muted-foreground">@ {fmtUSD(a.price)}</span>
                    <button
                      onClick={() => {
                        try { mainSeries.current?.removePriceLine(a.line); } catch { /* */ }
                        setAlerts(arr => arr.filter(x => x.id !== a.id));
                      }}
                      className="ml-auto text-muted-foreground hover:text-loss"
                      title="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="screener" className="m-0 p-3 max-h-56 overflow-y-auto">
            <div className="flex items-center gap-2 mb-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={screenerQuery}
                  onChange={(e) => setScreenerQuery(e.target.value)}
                  placeholder="Filter by symbol, name, or sector"
                  className="h-7 w-64 pl-7 font-mono text-xs"
                />
              </div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                {STOCK_UNIVERSE.length} tickers · live polling
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1">
              {STOCK_UNIVERSE.filter(s => {
                const q = screenerQuery.trim().toLowerCase();
                if (!q) return true;
                return (
                  s.symbol.toLowerCase().includes(q) ||
                  s.name.toLowerCase().includes(q) ||
                  s.sector.toLowerCase().includes(q)
                );
              }).map(s => (
                <button
                  key={s.symbol}
                  onClick={() => { setInput(s.symbol); setSymbol(s.symbol); }}
                  className={`flex items-center justify-between gap-2 h-7 px-2 text-xs font-mono border border-border text-left ${
                    s.symbol === symbol ? "bg-primary/15 text-primary" : "hover:bg-secondary"
                  }`}
                  title={`${s.name} · ${s.sector}`}
                >
                  <span className="font-semibold">{s.symbol}</span>
                  <span className="truncate text-[10px] text-muted-foreground">{s.name}</span>
                </button>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

const Sep = () => <div className="h-5 w-px bg-border mx-1 shrink-0" />;

const Stat = ({ label, value, tone }: { label: string; value: string; tone?: "gain" | "loss" }) => (
  <span className="text-muted-foreground">
    {label} <span className={`tabular-nums ${tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-foreground"}`}>{value}</span>
  </span>
);

const ToolbarBtn = ({ icon: Icon, label, text, onClick }: { icon: typeof Bell; label: string; text?: string; onClick?: () => void }) => (
  <button
    onClick={onClick}
    title={label}
    className="h-7 px-2 flex items-center gap-1 text-muted-foreground hover:text-foreground hover:bg-secondary text-[11px] font-mono shrink-0"
  >
    <Icon className="h-3.5 w-3.5" />
    {text && <span>{text}</span>}
  </button>
);

const ToolBtn = ({ id, icon: Icon, active, onClick, title }: { id: string; icon: typeof Bell; active: boolean; onClick: () => void; title?: string }) => (
  <button
    onClick={onClick}
    title={title || id}
    className={`h-7 w-7 flex items-center justify-center transition-colors ${
      active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
    }`}
  >
    <Icon className="h-3.5 w-3.5" />
  </button>
);

const OrderBook = ({ price }: { price: number }) => {
  const rows = Array.from({ length: 8 }, (_, i) => {
    const aSize = Math.round(50 + Math.random() * 950);
    const bSize = Math.round(50 + Math.random() * 950);
    return {
      ask: { price: price * (1 + (i + 1) * 0.0005), size: aSize },
      bid: { price: price * (1 - (i + 1) * 0.0005), size: bSize },
    };
  });
  const max = Math.max(...rows.flatMap(r => [r.ask.size, r.bid.size]));
  return (
    <div className="grid grid-cols-2 gap-4 max-w-2xl font-mono text-xs">
      <div>
        <div className="grid grid-cols-2 text-[10px] uppercase tracking-wider text-muted-foreground pb-1 border-b border-border">
          <span>Bid</span><span className="text-right">Size</span>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="relative grid grid-cols-2 py-0.5">
            <div className="absolute inset-y-0 right-0 bg-gain-soft" style={{ width: `${(r.bid.size / max) * 100}%` }} />
            <span className="relative text-gain">{r.bid.price.toFixed(2)}</span>
            <span className="relative text-right text-muted-foreground">{r.bid.size}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="grid grid-cols-2 text-[10px] uppercase tracking-wider text-muted-foreground pb-1 border-b border-border">
          <span>Ask</span><span className="text-right">Size</span>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="relative grid grid-cols-2 py-0.5">
            <div className="absolute inset-y-0 right-0 bg-loss-soft" style={{ width: `${(r.ask.size / max) * 100}%` }} />
            <span className="relative text-loss">{r.ask.price.toFixed(2)}</span>
            <span className="relative text-right text-muted-foreground">{r.ask.size}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Trade;
