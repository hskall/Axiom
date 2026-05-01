const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MiniQuote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  prevClose: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const symbols: string[] = Array.isArray(body.symbols)
      ? body.symbols.map((s: unknown) => String(s).trim().toUpperCase()).filter(Boolean).slice(0, 100)
      : [];
    if (symbols.length === 0) throw new Error("symbols required");

    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`;
    const yRes = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const quotes: MiniQuote[] = [];

    if (yRes.ok) {
      const j = await yRes.json();
      const list = j?.quoteResponse?.result ?? [];
      for (const q of list) {
        const price = Number(q.regularMarketPrice ?? 0);
        const prev = Number(q.regularMarketPreviousClose ?? price);
        quotes.push({
          symbol: String(q.symbol),
          price,
          change: Number(q.regularMarketChange ?? price - prev),
          changePct: Number(q.regularMarketChangePercent ?? (prev ? ((price - prev) / prev) * 100 : 0)),
          prevClose: prev,
        });
      }
    }

    // Fallback: per-symbol chart endpoint for any missing tickers
    const got = new Set(quotes.map((q) => q.symbol));
    const missing = symbols.filter((s) => !got.has(s));
    await Promise.all(
      missing.map(async (sym) => {
        try {
          const r = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`,
            { headers: { "User-Agent": "Mozilla/5.0" } },
          );
          if (!r.ok) return;
          const j = await r.json();
          const meta = j?.chart?.result?.[0]?.meta;
          if (!meta) return;
          const price = Number(meta.regularMarketPrice ?? 0);
          const prev = Number(meta.chartPreviousClose ?? meta.previousClose ?? price);
          quotes.push({
            symbol: sym,
            price,
            change: price - prev,
            changePct: prev ? ((price - prev) / prev) * 100 : 0,
            prevClose: prev,
          });
        } catch { /* ignore */ }
      }),
    );

    return new Response(JSON.stringify({ quotes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});