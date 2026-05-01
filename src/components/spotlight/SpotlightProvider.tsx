import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, ChevronLeft } from "lucide-react";

export interface SpotlightStep {
  id: string;
  title: string;
  body: string;
  formula?: string;
  /** css selector for the element to highlight, or null for centered intro */
  selector?: string | null;
  placement?: "top" | "bottom" | "left" | "right" | "center";
}

interface SpotlightCtx {
  start: (steps: SpotlightStep[], onFinish?: () => void) => void;
  stop: () => void;
  active: boolean;
}

const Ctx = createContext<SpotlightCtx>({ start: () => {}, stop: () => {}, active: false });

export const useSpotlight = () => useContext(Ctx);

export const SpotlightProvider = ({ children }: { children: ReactNode }) => {
  const [steps, setSteps] = useState<SpotlightStep[]>([]);
  const [index, setIndex] = useState(0);
  const [active, setActive] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const finishRef = useRef<(() => void) | undefined>(undefined);

  const step = active ? steps[index] : null;

  const measure = useCallback(() => {
    if (!step?.selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setRect(el.getBoundingClientRect());
  }, [step]);

  useEffect(() => {
    if (!active) return;
    measure();
    const handle = () => measure();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    const t = setInterval(measure, 400);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
      clearInterval(t);
    };
  }, [active, measure]);

  const start = useCallback((newSteps: SpotlightStep[], onFinish?: () => void) => {
    if (!newSteps.length) return;
    setSteps(newSteps);
    setIndex(0);
    setActive(true);
    finishRef.current = onFinish;
  }, []);

  const finish = useCallback(() => {
    setActive(false);
    setRect(null);
    finishRef.current?.();
    finishRef.current = undefined;
  }, []);

  const next = () => {
    if (index >= steps.length - 1) finish();
    else setIndex(index + 1);
  };
  const prev = () => index > 0 && setIndex(index - 1);

  const value = useMemo(() => ({ start, stop: finish, active }), [start, finish, active]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {active && step && createPortal(
        <SpotlightOverlay
          step={step}
          rect={rect}
          index={index}
          total={steps.length}
          onNext={next}
          onPrev={prev}
          onSkip={finish}
        />,
        document.body
      )}
    </Ctx.Provider>
  );
};

const PADDING = 8;

const SpotlightOverlay = ({
  step, rect, index, total, onNext, onPrev, onSkip,
}: {
  step: SpotlightStep;
  rect: DOMRect | null;
  index: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}) => {
  const tooltipPos = computeTooltipPosition(rect, step.placement);

  return (
    <div className="fixed inset-0 z-[100] animate-fade-in">
      {/* SVG mask for spotlight cutout */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <mask id="spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left - PADDING}
                y={rect.top - PADDING}
                width={rect.width + PADDING * 2}
                height={rect.height + PADDING * 2}
                rx="0"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="black" fillOpacity="0.78" mask="url(#spotlight-mask)" />
        {rect && (
          <rect
            x={rect.left - PADDING}
            y={rect.top - PADDING}
            width={rect.width + PADDING * 2}
            height={rect.height + PADDING * 2}
            rx="0"
            fill="none"
            stroke="hsl(122 100% 39%)"
            strokeWidth="2"
            className="animate-pulse-ring"
          />
        )}
      </svg>

      {/* Tooltip */}
      <div
        className="absolute w-[min(380px,calc(100vw-2rem))] rounded-xl border border-border bg-popover p-5 shadow-elev animate-fade-in"
        style={tooltipPos}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-primary uppercase tracking-wider">
              Step {index + 1} / {total}
            </span>
          </div>
          <button onClick={onSkip} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <h3 className="text-base font-semibold mb-2">{step.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed mb-3">{step.body}</p>
        {step.formula && (
          <div className="rounded-md bg-secondary/60 border border-border/60 px-3 py-2 mb-4 font-mono text-xs text-foreground/90 overflow-x-auto">
            {step.formula}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onPrev} disabled={index === 0}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onSkip}>Skip tour</Button>
            <Button size="sm" onClick={onNext}>
              {index === total - 1 ? "Finish" : "Next"} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

function computeTooltipPosition(rect: DOMRect | null, placement?: SpotlightStep["placement"]): React.CSSProperties {
  const W = 380, H = 240;
  if (!rect || placement === "center") {
    return { left: `calc(50% - ${W / 2}px)`, top: `calc(50% - ${H / 2}px)` };
  }
  const margin = 16;
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = rect.left + rect.width / 2 - W / 2;
  let top = rect.bottom + margin;
  // Prefer below; flip if no room
  if (top + H > vh - margin) {
    top = rect.top - H - margin;
  }
  if (top < margin) top = margin;
  if (left < margin) left = margin;
  if (left + W > vw - margin) left = vw - margin - W;
  return { left, top };
}
