const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FinnhubQuote { c: number; d: number; dp: number; h: number; l: number; o: number; pc: number; t: number; }

// Map our intervals → Yahoo (interval, range)
const YAHOO_MAP: Record<string, { interval: string; range: string }> = {
  "1m":  { interval: "1m",  range: "1d"  },
  "5m":  { interval: "5m",  range: "5d"  },
  "15m": { interval: "15m", range: "1mo" },
  "1H":  { interval: "60m", range: "3mo" },
  "4H":  { interval: "60m", range: "6mo" },
  "1D":  { interval: "1d",  range: "1y"  },
  "1W":  { interval: "1wk", range: "5y"  },
  "1M":  { interval: "1mo", range: "max" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const sym = String(body.symbol || "").trim().toUpperCase().slice(0, 10);
    const interval = String(body.interval || "1D");
    if (!sym) throw new Error("symbol required");

    const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY");

    // ---- Quote (Finnhub) ----
    let quote: FinnhubQuote | null = null;
    if (FINNHUB_API_KEY) {
      const qRes = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_API_KEY}`);
      if (qRes.ok) quote = await qRes.json();
    }

    // ---- Candles (Yahoo Finance, no key required) ----
    const map = YAHOO_MAP[interval] ?? YAHOO_MAP["1D"];
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${map.interval}&range=${map.range}&includePrePost=false`;
    const yRes = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    let candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> = [];
    if (yRes.ok) {
      const j = await yRes.json();
      const result = j?.chart?.result?.[0];
      if (result) {
        const ts: number[] = result.timestamp ?? [];
        const q = result.indicators?.quote?.[0] ?? {};
        const o: (number | null)[] = q.open ?? [];
        const h: (number | null)[] = q.high ?? [];
        const l: (number | null)[] = q.low ?? [];
        const c: (number | null)[] = q.close ?? [];
        const v: (number | null)[] = q.volume ?? [];
        for (let i = 0; i < ts.length; i++) {
          if (o[i] == null || h[i] == null || l[i] == null || c[i] == null) continue;
          candles.push({
            time: ts[i],
            open: o[i] as number,
            high: h[i] as number,
            low: l[i] as number,
            close: c[i] as number,
            volume: Number(v[i] ?? 0),
          });
        }

        // Fallback quote from yahoo meta if Finnhub unavailable
        if (!quote || !quote.c) {
          const meta = result.meta ?? {};
          const last = Number(meta.regularMarketPrice ?? candles.at(-1)?.close ?? 0);
          const prev = Number(meta.chartPreviousClose ?? meta.previousClose ?? candles.at(-2)?.close ?? last);
          quote = {
            c: last,
            d: last - prev,
            dp: prev ? ((last - prev) / prev) * 100 : 0,
            h: Number(meta.regularMarketDayHigh ?? Math.max(...candles.slice(-1).map(k => k.high))),
            l: Number(meta.regularMarketDayLow ?? Math.min(...candles.slice(-1).map(k => k.low))),
            o: Number(candles.at(-1)?.open ?? last),
            pc: prev,
            t: Math.floor(Date.now() / 1000),
          };
        }
      }
    }

    if (!quote) throw new Error(`Could not load data for ${sym}`);

    return new Response(JSON.stringify({ quote, candles }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
