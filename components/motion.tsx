import React, { useEffect, useRef, useState } from "react";
import { cx } from "./ui";

/** True when the person asked their device for less motion. Everything below respects it. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/**
 * Fades and lifts its children in when they scroll into view (once).
 * Safety net: if the observer never fires, the content still appears after a moment, so nothing can stay hidden.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    if (reduced || typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) { setShown(true); io.disconnect(); }
      },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" }
    );
    io.observe(el);
    const fallback = setTimeout(() => setShown(true), 2500);
    return () => { io.disconnect(); clearTimeout(fallback); };
  }, [shown, reduced]);

  const Comp = Tag as React.ElementType;
  return (
    <Comp ref={ref} className={cx("reveal", shown && "in", className)} style={{ ["--d" as string]: `${delay}ms` }}>
      {children}
    </Comp>
  );
}

/** A number that counts up to its value (and re-counts smoothly when the value changes). */
export function CountUp({ value, duration = 1100, decimals = 0, suffix = "" }: { value: number; duration?: number; decimals?: number; suffix?: string }) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(0);

  useEffect(() => {
    if (reduced) { setShown(value); return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      const v = a + (value - a) * eased;
      setShown(v);
      from.current = v;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduced]);

  return <>{shown.toFixed(decimals)}{suffix}</>;
}

/**
 * Cards that lean toward the pointer with a soft light glare, for depth.
 * Only on devices with a real mouse; touch screens and reduced-motion get a flat card.
 */
export function Tilt({ children, max = 5, className }: { children: React.ReactNode; max?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [fine, setFine] = useState(false);
  useEffect(() => { setFine(window.matchMedia("(hover: hover) and (pointer: fine)").matches); }, []);
  const enabled = fine && !reduced;

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || !enabled) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.classList.add("moving");
    el.style.setProperty("--ry", `${(px - 0.5) * 2 * max}deg`);
    el.style.setProperty("--rx", `${-(py - 0.5) * 2 * max}deg`);
    el.style.setProperty("--gx", `${px * 100}%`);
    el.style.setProperty("--gy", `${py * 100}%`);
    el.style.setProperty("--go", "1");
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove("moving");
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--go", "0");
  };

  return (
    <div ref={ref} onPointerMove={move} onPointerLeave={leave} className={cx(enabled && "tilt", "relative", className)}>
      {children}
      {enabled && <span className="tilt-glare" aria-hidden="true" />}
    </div>
  );
}

/** Circular gauge: confirmed work in green, work waiting for review in hatched amber. Draws itself on load. */
export function RingGauge({ confirmed, pending, size = 168, stroke = 14 }: { confirmed: number; pending: number; size?: number; stroke?: number }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const conf = Math.max(0, Math.min(100, confirmed));
  const pend = Math.max(0, Math.min(100 - conf, pending));
  const confLen = (conf / 100) * c;
  const pendLen = (pend / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(conf)} percent confirmed, ${Math.round(pend)} percent awaiting review`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#FBBF24" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${pendLen} ${c}`} strokeDashoffset={ready ? -confLen : 0} opacity={ready && pend > 0 ? 1 : 0}
        style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(.22,1,.36,1) .15s, opacity .6s .6s" }}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#22C59A" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${ready ? confLen : 0} ${c}`}
        style={{ transition: "stroke-dasharray 1.4s cubic-bezier(.22,1,.36,1)" }}
      />
    </svg>
  );
}

/**
 * Page-level scroll effects: a thin progress bar and soft colour orbs that drift at a different speed
 * from the content (parallax). Uses direct style writes in one animation frame per scroll, so React never re-renders.
 */
export function ScrollEffects() {
  const bar = useRef<HTMLDivElement>(null);
  const a = useRef<HTMLDivElement>(null);
  const b = useRef<HTMLDivElement>(null);
  const c = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      if (bar.current) bar.current.style.transform = `scaleX(${Math.min(1, y / max)})`;
      if (!reduced) {
        if (a.current) a.current.style.transform = `translate3d(0, ${y * -0.12}px, 0)`;
        if (b.current) b.current.style.transform = `translate3d(0, ${y * -0.2}px, 0)`;
        if (c.current) c.current.style.transform = `translate3d(0, ${y * -0.07}px, 0)`;
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[35] h-[3px] bg-transparent" aria-hidden="true">
        <div ref={bar} className="h-full origin-left scale-x-0 bg-gradient-to-r from-info via-ok to-warn" />
      </div>
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div ref={a} className="orb orb-a" />
        <div ref={b} className="orb orb-b" />
        <div ref={c} className="orb orb-c" />
      </div>
    </>
  );
}
