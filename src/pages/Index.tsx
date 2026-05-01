import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LEVELS } from "@/lib/levels";
import { TrendingUp, ArrowRight, ShieldCheck, Zap, BarChart3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const Index = () => {
  const { session } = useAuth();
  const ctaTo = session ? "/app" : "/auth";
  // 0 = crumpled ball, 1 = mid-unfold, 2 = flat sheet, 3 = dismissed
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (sessionStorage.getItem("axiom-intro-played") === "1") {
      setPhase(3);
      return;
    }
    const t1 = setTimeout(() => setPhase(1), 600);
    const t2 = setTimeout(() => setPhase(2), 1700);
    const t3 = setTimeout(() => {
      setPhase(3);
      sessionStorage.setItem("axiom-intro-played", "1");
    }, 2900);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Axiom",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    description: "Professional paper-trading and financial education across 5 levels.",
  };

  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Crumpled-paper intro overlay */}
      {phase < 3 && <PaperIntro phase={phase} />}

      {/* Nav */}
      <header className="border-b border-border/60">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg gradient-primary flex items-center justify-center shadow-glow">
              <TrendingUp className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight">Axiom</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to={ctaTo}>{session ? "Open Dashboard" : "Start free"}</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="gradient-hero">
        <div className="container py-20 md:py-32 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs text-muted-foreground mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-gain animate-pulse" />
            Live market data · 5-level simulation · $100k paper cash
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 max-w-3xl mx-auto leading-tight">
            Trade markets. <span className="bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">Master yourself.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            Axiom Finance bridges abstract finance and real-market behavior. Learn budgeting, equity trading, crisis management, algorithmic strategies, and behavioral analytics — risk-free.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="shadow-glow">
              <Link to={ctaTo}>
                {session ? "Open Dashboard" : "Start trading free"} <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
            <div className="flex items-center gap-6 text-xs text-muted-foreground font-mono">
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> No credit card</span>
              <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Real-time data</span>
            </div>
          </div>

          {/* Mock ticker */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto">
            {[
              { s: "AAPL", p: "234.18", c: "+1.24%", up: true },
              { s: "TSLA", p: "412.06", c: "-2.81%", up: false },
              { s: "NVDA", p: "192.44", c: "+3.17%", up: true },
              { s: "SPY", p: "612.89", c: "+0.42%", up: true },
            ].map((t) => (
              <div key={t.s} className="rounded-lg border border-border bg-card/60 p-3 text-left">
                <div className="text-xs font-mono text-muted-foreground">{t.s}</div>
                <div className="font-mono text-base font-semibold">${t.p}</div>
                <div className={`text-xs font-mono ${t.up ? "text-gain" : "text-loss"}`}>{t.c}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5 Levels */}
      <section className="container py-20">
        <div className="text-center mb-12">
          <p className="text-xs font-mono text-primary uppercase tracking-wider mb-3">The 5 Levels</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">A complete financial curriculum</h2>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto">Each level is a hands-on simulation. Master one, unlock the next.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {LEVELS.map((l) => (
            <div key={l.slug} className="group relative rounded-xl border border-border bg-card p-6 hover:border-primary/50 transition-colors">
              <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${l.accent} opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`} />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center">
                    <l.icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">LEVEL {l.num}</span>
                </div>
                <h3 className="text-lg font-semibold mb-1">{l.name}</h3>
                <p className="text-xs font-mono text-primary mb-3">{l.tagline}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{l.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Why */}
      <section className="border-t border-border/60 bg-card/30">
        <div className="container py-16 grid md:grid-cols-3 gap-8 text-center">
          <Feature icon={BarChart3} title="Real market data" body="Live quotes from Finnhub. Historical OHLCV from Alpha Vantage. No fake numbers." />
          <Feature icon={ShieldCheck} title="Zero risk" body="Trade with $100k of paper cash. Make every mistake here, not with your savings." />
          <Feature icon={Zap} title="Pro-grade analytics" body="Sharpe ratio, volatility, disposition effect — the same metrics hedge funds use." />
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="container py-8 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Axiom · Educational use only · Not investment advice
        </div>
      </footer>
    </div>
  );
};

const Feature = ({ icon: Icon, title, body }: { icon: typeof TrendingUp; title: string; body: string }) => (
  <div>
    <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center mx-auto mb-4">
      <Icon className="h-5 w-5 text-primary" />
    </div>
    <h3 className="font-semibold mb-2">{title}</h3>
    <p className="text-sm text-muted-foreground">{body}</p>
  </div>
);

export default Index;

/* ---------- Crumpled-paper intro ---------- */
const PaperIntro = ({ phase }: { phase: number }) => {
  // phase 0: tight crumpled ball, jiggling
  // phase 1: mid-unfold (paper expanding, creases relaxing)
  // phase 2: flat sheet revealing the brand
  const dismissing = phase === 2;
  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-background transition-opacity duration-700 ${
        dismissing ? "opacity-100" : "opacity-100"
      } ${phase === 2 ? "animate-fade-out-late" : ""}`}
      style={phase === 2 ? { animation: "fq-fade-late 1.1s ease-out forwards" } : undefined}
    >
      <div
        className="relative"
        style={{
          width: "min(78vmin, 640px)",
          height: "min(78vmin, 640px)",
          perspective: "1200px",
        }}
      >
        <div
          className="absolute inset-0 paper-texture border border-border/60 shadow-elev"
          style={{
            transformStyle: "preserve-3d",
            transformOrigin: "center",
            transform:
              phase === 0
                ? "scale(0.18) rotate(-22deg)"
                : phase === 1
                ? "scale(0.6) rotate(-6deg)"
                : "scale(1) rotate(0deg)",
            clipPath:
              phase === 0
                ? "polygon(46% 8%, 78% 18%, 92% 48%, 82% 82%, 52% 96%, 18% 84%, 6% 52%, 18% 18%)"
                : phase === 1
                ? "polygon(20% 8%, 78% 4%, 96% 28%, 92% 76%, 78% 96%, 22% 92%, 4% 70%, 6% 22%)"
                : "polygon(0 0, 100% 0, 100% 100%, 0 100%)",
            filter:
              phase === 0
                ? "blur(0.5px) brightness(0.8) contrast(1.4)"
                : phase === 1
                ? "blur(0.2px) brightness(0.95)"
                : "none",
            transition:
              "transform 1.1s cubic-bezier(0.22, 1, 0.36, 1), clip-path 1.1s cubic-bezier(0.22, 1, 0.36, 1), filter 0.9s ease-out",
          }}
        >
          {/* crease lines that fade as it flattens */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{
              opacity: phase === 0 ? 0.7 : phase === 1 ? 0.35 : 0,
              transition: "opacity 1.1s ease-out",
            }}
          >
            <g stroke="hsl(0 0% 100% / 0.18)" strokeWidth="0.3" fill="none">
              <path d="M10 22 L42 38 L18 58 L52 70 L86 50 L62 28 L90 14" />
              <path d="M22 10 L34 46 L8 78 L46 90 L72 64 L94 86" />
              <path d="M50 6 L46 50 L78 62 L60 92" />
              <path d="M14 40 L50 30 L78 52" />
              <path d="M30 70 L66 78 L84 38" />
            </g>
          </svg>

          {/* Brand reveal — only readable when flat */}
          <div
            className="absolute inset-0 flex items-center justify-center transition-opacity duration-700"
            style={{ opacity: phase === 2 ? 1 : 0 }}
          >
            <div className="text-center px-8">
              <div className="inline-flex h-12 w-12 items-center justify-center bg-primary/10 border border-primary/40 mb-4">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-2">
                Unfolding the paper
              </p>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Axiom</h2>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fq-fade-late {
          0%, 60% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};
