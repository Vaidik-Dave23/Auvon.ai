import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ThemeTogglePill from "../components/ThemeTogglePill";
import "./landing.css";

/* --------------------------------------------------------------------------
   Small scroll helpers (no libraries). Scroll-scrubbed values are written to
   CSS variables directly, so scrolling never re-renders React.
   -------------------------------------------------------------------------- */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function useRafScroll(callback) {
  const cb = useRef(callback);
  cb.current = callback;
  useEffect(() => {
    let raf = 0;
    const run = () => { raf = 0; cb.current(); };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(run); };
    run();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}

function useReveal(rootRef) {
  useEffect(() => {
    const els = rootRef.current?.querySelectorAll("[data-reveal]") ?? [];
    if (prefersReducedMotion()) { els.forEach((el) => el.classList.add("is-in")); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }),
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [rootRef]);
}

/* --------------------------------------------------------------------------
   Content
   -------------------------------------------------------------------------- */
const TOPICS = [
  "Quantum computing", "Merkle trees", "Photosynthesis", "Backpropagation", "The French Revolution",
  "Bayes' theorem", "Transformers", "Organic chemistry", "Game theory", "Fourier series",
];

const STEPS = [
  {
    num: "01",
    title: "Notes that read like a good textbook",
    body: "Type a topic or drop a PDF. Auvon writes structured notes with headings, worked examples and KaTeX math, then indexes them so you can chat with your own material.",
  },
  {
    num: "02",
    title: "Calm checkpoints, not timed exams",
    body: "Every note turns into a short multiple-choice checkpoint. Wrong answers are collected as weak topics and fed straight into your review.",
  },
  {
    num: "03",
    title: "A roadmap that keeps you moving",
    body: "Set a goal and a number of weeks. Auvon breaks it into weekly steps with videos, notes and tasks, and tracks how far you've come.",
  },
];

const TIERS = [
  { name: "Gemini 3.5 Flash", role: "Primary" },
  { name: "Gemini 2.5 Flash", role: "Secondary" },
  { name: "GPT-4o-mini", role: "Safety net" },
];

const LOG = [
  "request → Gemini 3.5 Flash · 200 OK",
  "Gemini 3.5 Flash · 429 quota exhausted → key blacklisted for today",
  "failover → Gemini 2.5 Flash · 200 OK",
  "Gemini 2.5 Flash · 429 → final fallback",
  "failover → GPT-4o-mini · 200 OK · user never noticed",
];

/* --------------------------------------------------------------------------
   Scenes for the sticky "how it works" visual
   -------------------------------------------------------------------------- */
function SceneFrame({ label, children }) {
  return (
    <div className="auvon-card !p-0 overflow-hidden w-full">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)]">
        <span className="font-mono text-[11px] text-[var(--text-muted)]">{label}</span>
        <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)]" />
      </div>
      <div className="p-6 md:p-8">{children}</div>
    </div>
  );
}

function NotesScene() {
  return (
    <SceneFrame label="notes / fourier-series.md">
      <div className="font-heading font-bold text-xl text-[var(--text-primary)] mb-4">Fourier Series</div>
      <div className="flex flex-col gap-2.5 mb-6">
        {[96, 88, 92, 64].map((w, i) => (
          <div key={i} className="lp-noteline" style={{ width: `${w}%`, "--d": `${i * 120}ms` }} />
        ))}
      </div>
      <div className="lp-formula mb-6 px-4 py-3 rounded-xl bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)]">
        f(x) = a₀ / 2 + Σ (aₙ cos nx + bₙ sin nx)
      </div>
      <div className="flex flex-col gap-2.5">
        {[90, 78].map((w, i) => (
          <div key={i} className="lp-noteline" style={{ width: `${w}%`, "--d": `${600 + i * 120}ms` }} />
        ))}
      </div>
    </SceneFrame>
  );
}

function QuizScene() {
  return (
    <SceneFrame label="checkpoint · question 3 of 5">
      <div className="font-heading font-semibold text-lg text-[var(--text-primary)] mb-5 leading-snug">
        What does the softmax function do in a Transformer?
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="lp-opt"><i />Increases the model's temperature</div>
        <div className="lp-opt is-pick"><i />Turns scores into a probability distribution</div>
        <div className="lp-opt"><i />Combines input vectors into one output</div>
        <div className="lp-opt"><i />Reduces embedding dimensionality</div>
      </div>
    </SceneFrame>
  );
}

function RoadmapScene() {
  const weeks = [
    ["Week 1 · Linear algebra refresher", "100%"],
    ["Week 2 · Gradient descent", "100%"],
    ["Week 3 · Backpropagation", "62%"],
    ["Week 4 · CNNs and attention", "8%"],
  ];
  return (
    <SceneFrame label="goal · deep learning in 4 weeks">
      <div className="flex items-baseline justify-between mb-6">
        <div className="font-heading font-bold text-xl text-[var(--text-primary)]">Deep Learning Foundations</div>
        <div className="font-mono text-xs text-[var(--accent-primary)]">68%</div>
      </div>
      <div className="flex flex-col gap-5">
        {weeks.map(([label, w], i) => (
          <div key={label}>
            <div className="text-[13px] text-[var(--text-secondary)] mb-2">{label}</div>
            <div className="lp-week-bar"><b style={{ "--w": w, "--d": `${i * 160}ms` }} /></div>
          </div>
        ))}
      </div>
    </SceneFrame>
  );
}

const SCENES = [NotesScene, QuizScene, RoadmapScene];

/* --------------------------------------------------------------------------
   Hero preview: a live, theme-aware mock of the current dashboard
   (replaces the old static screenshot, so it never goes out of date).
   -------------------------------------------------------------------------- */
function DashboardMock() {
  const now = new Date();
  const today = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
  const h = now.getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const tasks = [
    ["Read: Backpropagation notes", true],
    ["Checkpoint: Gradient descent quiz", true],
    ["Watch: Attention explained", false],
  ];
  const goals = [
    ["Deep Learning Foundations", "68%"],
    ["Linear Algebra Refresher", "100%"],
  ];
  return (
    <div className="text-left select-none p-4 md:p-7" aria-hidden="true">
      {/* mini app nav */}
      <div className="flex items-center justify-between rounded-full bg-[var(--bg-surface)] border border-[var(--border-card)] px-3 md:px-4 py-2 mb-5 md:mb-7">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-[var(--accent-primary)] text-white text-[10px] font-bold flex items-center justify-center">a</span>
          <span className="font-heading font-bold text-[13px] text-[var(--text-primary)]">Auvon <span className="text-[var(--accent-primary)]">ai</span></span>
        </div>
        <div className="hidden md:flex items-center gap-1 text-[12px]">
          <span className="px-3 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold">Today</span>
          <span className="px-3 py-1 text-[var(--text-secondary)]">Roadmap</span>
          <span className="px-3 py-1 text-[var(--text-secondary)]">Notes</span>
          <span className="px-3 py-1 text-[var(--text-secondary)]">Practice</span>
        </div>
        <span className="text-[11px] px-3 py-1 rounded-full bg-[var(--accent-primary)] text-white font-semibold">+ New Goal</span>
      </div>

      <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--text-muted)] mb-1">{today}</div>
      <div className="font-heading font-bold text-xl md:text-[28px] tracking-[-0.02em] text-[var(--text-primary)] mb-4 md:mb-6">{greeting}, learner</div>

      {/* active goal */}
      <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-card)] p-4 md:p-6 mb-3 md:mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="auvon-telemetry-badge !text-[10px] !py-1">Active Goal</span>
          <span className="font-mono text-[11px] text-[var(--accent-primary)]">68% Complete</span>
        </div>
        <div className="font-heading font-bold text-lg md:text-2xl text-[var(--text-primary)] mb-1">Deep Learning Foundations</div>
        <div className="text-[12px] md:text-[13px] text-[var(--text-secondary)] mb-4">Week 3 of 4 · Backpropagation</div>
        <div className="lp-week-bar"><b style={{ "--w": "68%", "--d": "900ms" }} className="lp-hero-bar" /></div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-card)] mb-3 md:mb-4 divide-x divide-[var(--border-subtle)]">
        {[["TASKS DONE TODAY", "2", " / 3"], ["ACTIVE FOCUS", "Backprop", ""], ["LAST CHECKPOINT", "80", "%"]].map(([k, v, s]) => (
          <div key={k} className="p-3 md:p-5">
            <div className="font-mono text-[8px] md:text-[10px] tracking-[0.1em] text-[var(--text-muted)] mb-1.5">{k}</div>
            <div className="font-heading font-bold text-base md:text-2xl text-[var(--text-primary)]">{v}<span className="text-[var(--text-muted)] font-medium text-sm">{s}</span></div>
          </div>
        ))}
      </div>

      {/* tasks + roadmap */}
      <div className="hidden md:grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-card)] p-5">
          <div className="font-heading font-semibold text-[15px] text-[var(--text-primary)] mb-3">Today's Tasks</div>
          <div className="flex flex-col gap-2">
            {tasks.map(([t, done]) => (
              <div key={t} className="flex items-center gap-2.5 text-[12.5px]">
                <span className={`w-4 h-4 rounded-md border flex items-center justify-center text-[9px] ${done ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white" : "border-[var(--border-subtle)]"}`}>{done ? "✓" : ""}</span>
                <span className={done ? "text-[var(--text-muted)] line-through" : "text-[var(--text-secondary)]"}>{t}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-card)] p-5">
          <div className="font-heading font-semibold text-[15px] text-[var(--text-primary)] mb-3">Roadmap Progress</div>
          <div className="flex flex-col gap-3">
            {goals.map(([g, w], i) => (
              <div key={g}>
                <div className="flex justify-between text-[12px] text-[var(--text-secondary)] mb-1.5"><span>{g}</span><span className="font-mono text-[var(--accent-primary)]">{w}</span></div>
                <div className="lp-week-bar"><b className="lp-hero-bar" style={{ "--w": w, "--d": `${1100 + i * 150}ms` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Page
   -------------------------------------------------------------------------- */
function LandingPage() {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const shotRef = useRef(null);
  const stepsRef = useRef(null);
  const pinRef = useRef(null);
  const bigRef = useRef(null);

  const [scrolled, setScrolled] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [failStage, setFailStage] = useState(0); // 0..4 → which LOG lines are visible
  const [section, setSection] = useState("");

  useReveal(rootRef);

  useRafScroll(() => {
    const vh = window.innerHeight;
    const doc = document.documentElement;
    const reduce = prefersReducedMotion();

    // page progress bar
    const max = doc.scrollHeight - vh;
    doc.style.setProperty("--lp-scroll", max > 0 ? (window.scrollY / max).toFixed(4) : 0);
    setScrolled(window.scrollY > 24);

    // hero screenshot flattens as it scrolls up
    if (shotRef.current && !reduce) {
      const r = shotRef.current.getBoundingClientRect();
      shotRef.current.style.setProperty("--p", clamp(1 - (r.top - vh * 0.12) / (vh * 0.55)).toFixed(4));
    }

    // sticky steps: rail fill + active step
    if (stepsRef.current) {
      const r = stepsRef.current.getBoundingClientRect();
      const p = clamp((vh * 0.5 - r.top) / r.height);
      stepsRef.current.style.setProperty("--rail", p.toFixed(4));
      setActiveStep(Math.min(STEPS.length - 1, Math.floor(p * STEPS.length)));
    }

    // pinned failover cascade
    if (pinRef.current) {
      const r = pinRef.current.getBoundingClientRect();
      const desktop = window.matchMedia("(min-width: 768px)").matches;
      const p = desktop
        ? clamp(-r.top / (r.height - vh))
        : clamp((vh * 0.75 - r.top) / r.height);
      const stage = Math.min(LOG.length - 1, Math.floor(p * LOG.length));
      setFailStage(stage);
      pinRef.current.style.setProperty("--fp", p.toFixed(4));
    }

    // final CTA scales in
    if (bigRef.current && !reduce) {
      const r = bigRef.current.getBoundingClientRect();
      bigRef.current.style.setProperty("--p", clamp((vh - r.top) / (vh * 0.45)).toFixed(4));
    }

    // active nav link
    const ids = ["how", "reliability"];
    let current = "";
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top < vh * 0.4) current = id;
    });
    setSection(current);
  });

  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // failover tier state from the scroll stage
  const tierState = (i) => {
    const activeTier = failStage <= 0 ? 0 : failStage <= 2 ? 1 : 2;
    if (i === activeTier) return "is-active";
    if (i < activeTier) return "is-limited";
    if (i === 0 && failStage === 1) return "is-limited";
    return "";
  };
  const tierLabel = (i) => {
    const s = tierState(i);
    return s === "is-active" ? "Serving" : s === "is-limited" ? "Rate limited" : "Standby";
  };
  const wireFill = (i) => (i === 0 ? clamp((failStage - 0.5) / 1.5) : clamp((failStage - 2.5) / 1.5));

  return (
    <div ref={rootRef} className="lp min-h-screen bg-[var(--bg-canvas-gradient)] text-[var(--text-primary)] font-sans">
      <div className="lp-progress" aria-hidden="true" />

      {/* NAV */}
      <div className="lp-nav-wrap">
        <nav className={`lp-nav ${scrolled ? "is-scrolled" : ""}`}>
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-2.5 cursor-pointer select-none bg-transparent border-0">
            <span className="w-8 h-8 rounded-full bg-[var(--accent-primary)] flex items-center justify-center text-white font-bold text-xs">a</span>
            <span className="font-bold text-lg tracking-tight font-heading text-[var(--text-primary)]">
              Auvon <span className="text-[var(--accent-primary)]">ai</span>
            </span>
          </button>

          <div className="hidden md:flex items-center gap-8">
            <button className={`lp-navlink ${section === "how" ? "is-active" : ""}`} onClick={() => go("how")}>How it works</button>
            <button className={`lp-navlink ${section === "reliability" ? "is-active" : ""}`} onClick={() => go("reliability")}>Reliability</button>
            <button className="lp-navlink" onClick={() => navigate("/about")}>About</button>
          </div>

          <div className="flex items-center gap-2.5">
            <ThemeTogglePill className="hidden lg:inline-flex" />
            <button onClick={() => navigate("/login")} className="auvon-pill-btn-secondary text-xs !py-2 !px-4 cursor-pointer">Sign in</button>
            <button onClick={() => navigate("/register")} className="auvon-pill-btn-primary text-xs !py-2 !px-4 cursor-pointer hidden sm:inline-flex">Get started</button>
          </div>
        </nav>
      </div>

      {/* HERO */}
      <header className="relative text-center pt-20 md:pt-28 px-6 max-w-5xl mx-auto flex flex-col items-center">
        <span className="auvon-telemetry-badge lp-fade" style={{ "--d": "0ms" }}>AI LEARNING SYSTEM</span>

        <h1 className="mt-7 text-[44px] leading-[1.02] md:text-[84px] font-bold tracking-[-0.035em] font-heading text-[var(--text-primary)]">
          <span className="lp-line"><span style={{ "--d": "120ms" }}>Cultivate deep focus.</span></span>
          <span className="lp-line"><span style={{ "--d": "260ms" }}>
            Master <span className="lp-serif text-[var(--accent-primary)]">any topic.</span>
          </span></span>
        </h1>

        <p className="lp-fade mt-7 text-[var(--text-secondary)] text-base md:text-lg leading-relaxed max-w-xl" style={{ "--d": "520ms" }}>
          Notes, checkpoints and week-by-week roadmaps generated from any topic or PDF, in one calm workspace.
        </p>

        <div className="lp-fade mt-9 flex flex-col sm:flex-row gap-3 w-full sm:w-auto" style={{ "--d": "660ms" }}>
          <button onClick={() => navigate("/register")} className="auvon-pill-btn-primary px-8 py-3.5 text-sm cursor-pointer">Get started free →</button>
          <button onClick={() => go("how")} className="auvon-pill-btn-secondary px-8 py-3.5 text-sm cursor-pointer">See how it works</button>
        </div>

        <div className="lp-stage w-full mt-16 md:mt-20 lp-fade" style={{ "--d": "780ms" }}>
          <div ref={shotRef} className="lp-shot w-full max-w-[1040px] mx-auto border border-[var(--border-card)] rounded-[24px] bg-[var(--bg-surface)] p-3 shadow-2xl">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] rounded-t-xl">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--border-subtle)]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--border-subtle)]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--border-subtle)]" />
              </div>
              <div className="text-[11px] text-[var(--text-muted)] font-mono select-none">auvon.ai/dashboard</div>
              <div className="w-12" />
            </div>
            <div className="bg-[var(--bg-canvas)] rounded-b-xl overflow-hidden">
              <DashboardMock />
            </div>
          </div>
        </div>
      </header>

      {/* TOPIC MARQUEE */}
      <section className="mt-24 md:mt-32" aria-label="Example topics">
        <p data-reveal className="text-center font-mono text-[11px] tracking-[0.12em] text-[var(--text-muted)] mb-6">STUDY ANYTHING</p>
        <div className="lp-marquee overflow-hidden">
          <div className="lp-marquee-track">
            {[...TOPICS, ...TOPICS].map((t, i) => (
              <React.Fragment key={i}>
                <span className="lp-topic">{t}</span>
                <span className="lp-topic-dot" aria-hidden="true">✦</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — sticky scroll */}
      <section id="how" className="px-6 max-w-[1160px] mx-auto w-full mt-28 md:mt-40">
        <div className="max-w-2xl mb-8 md:mb-0">
          <span data-reveal className="auvon-telemetry-badge">HOW IT WORKS</span>
          <h2 data-reveal style={{ "--d": "80ms" }} className="mt-5 text-3xl md:text-[52px] leading-[1.05] font-bold tracking-[-0.03em] font-heading">
            From a topic to <span className="lp-serif text-[var(--accent-primary)]">mastery</span>, in three moves.
          </h2>
        </div>

        <div ref={stepsRef} className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-16">
          <div className="md:col-span-5 relative md:pl-8">
            <div className="lp-rail hidden md:block"><div className="lp-rail-fill" /></div>
            {STEPS.map((s, i) => {
              const Scene = SCENES[i];
              return (
                <div key={s.num} className={`lp-step ${activeStep === i ? "is-active" : ""}`}>
                  <div className="lp-step-num mb-3">{s.num} / 03</div>
                  <h3 className="font-heading font-bold text-2xl md:text-[30px] leading-tight tracking-[-0.02em] mb-4">{s.title}</h3>
                  <p className="text-[var(--text-secondary)] text-[15px] leading-relaxed max-w-md">{s.body}</p>
                  <div className="md:hidden mt-6 relative">
                    <div className="lp-scene is-on !static"><Scene /></div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden md:block md:col-span-7">
            <div className="lp-sticky">
              <div className="relative w-full h-[460px]">
                {SCENES.map((Scene, i) => (
                  <div key={i} className={`lp-scene flex items-center ${activeStep === i ? "is-on" : ""}`}>
                    <Scene />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* RELIABILITY — pinned, scroll-driven failover */}
      <section id="reliability" ref={pinRef} className="lp-pin mt-16 md:mt-24">
        <div className="lp-pin-inner">
          <div className="px-6 max-w-[1160px] mx-auto w-full grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-16 items-center">
            <div className="md:col-span-6">
              <span className="auvon-telemetry-badge">FAILOVER, LIVE</span>
              <h2 className="mt-5 text-3xl md:text-[52px] leading-[1.05] font-bold tracking-[-0.03em] font-heading">
                When a model runs out, <span className="lp-serif text-[var(--accent-primary)]">the next one</span> picks up.
              </h2>
              <p className="mt-6 text-[var(--text-secondary)] text-[15px] md:text-base leading-relaxed max-w-lg">
                Every AI request walks a cascade of models and API keys. Keys that hit their daily quota are skipped for the rest of the day, and the request moves down the chain without the student seeing an error.
              </p>
              <p className="mt-6 font-mono text-[11px] tracking-[0.1em] text-[var(--text-muted)]">KEEP SCROLLING TO TRIGGER A FAILOVER ↓</p>
            </div>

            <div className="md:col-span-6">
              <div className="auvon-card !p-6 md:!p-7">
                <div className="flex items-center justify-between pb-4 mb-5 border-b border-[var(--border-subtle)] font-mono text-[10px] tracking-[0.1em] text-[var(--text-muted)]">
                  <span>LLM ROUTER</span>
                  <span className="text-[var(--accent-primary)]">STAGE {failStage + 1} / {LOG.length}</span>
                </div>

                <div className="flex flex-col">
                  {TIERS.map((t, i) => (
                    <React.Fragment key={t.name}>
                      <div className={`lp-tier ${tierState(i)}`}>
                        <span className="flex items-center"><span className="lp-dot" />{t.name}<span className="ml-2 text-[11px] opacity-60">· {t.role}</span></span>
                        <span className="lp-state">{tierLabel(i)}</span>
                      </div>
                      {i < TIERS.length - 1 && <div className="lp-wire"><b style={{ "--w": wireFill(i) }} /></div>}
                    </React.Fragment>
                  ))}
                </div>

                <div className="mt-6 pt-4 border-t border-[var(--border-subtle)] lp-log flex flex-col gap-1.5">
                  {LOG.map((line, i) => (
                    <div key={i} className={`lp-log-line ${i <= failStage ? "is-in" : ""} ${i === failStage ? "text-[var(--text-primary)]" : ""}`}>
                      <span className="text-[var(--accent-primary)] mr-2">&gt;</span>{line}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="px-6 pt-16 pb-24 md:pt-20 md:pb-32 text-center">
        <div ref={bigRef} className="lp-big">
          <h2 className="text-[42px] md:text-[96px] leading-[1] font-bold tracking-[-0.04em] font-heading">
            Study with <span className="lp-serif text-[var(--accent-primary)]">daylight</span> clarity.
          </h2>
        </div>
        <p data-reveal className="mt-7 text-[var(--text-secondary)] text-sm md:text-base">Free to start. No payment details needed.</p>
        <div data-reveal style={{ "--d": "120ms" }} className="mt-8 flex justify-center">
          <button onClick={() => navigate("/register")} className="auvon-pill-btn-primary px-9 py-4 text-sm cursor-pointer">Get started free →</button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[var(--border-subtle)] py-8 px-6 w-full max-w-[1160px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="font-heading font-bold text-base select-none">auvon<span className="text-[var(--accent-primary)]">.ai</span></div>
        <div className="flex flex-wrap items-center gap-3 text-[var(--text-muted)] text-xs font-mono">
          <button onClick={() => navigate("/about")} className="hover:text-[var(--text-primary)] transition-colors cursor-pointer bg-transparent border-0">About</button>
          <span>•</span>
          <a href="mailto:davevaidik20@gmail.com" className="hover:text-[var(--text-primary)] transition-colors">Contact</a>
          <span>•</span>
          <a href="https://www.linkedin.com/in/vaidik-dave-0457873ab" target="_blank" rel="noreferrer" className="hover:text-[var(--text-primary)] transition-colors">LinkedIn</a>
          <ThemeTogglePill className="lg:hidden ml-2" />
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
