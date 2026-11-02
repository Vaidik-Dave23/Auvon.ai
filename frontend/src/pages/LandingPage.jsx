import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

function LandingPage() {
  const navigate = useNavigate();

  // State for image handling
  const [imgError, setImgError] = useState(false);

  // State for Architecture Live Simulation
  const [simStep, setSimStep] = useState(0);
  const [simLog, setSimLog] = useState("Primary model (Gemini 3.5) active and handling incoming requests.");

  useEffect(() => {
    const interval = setInterval(() => {
      setSimStep((prevStep) => {
        const nextStep = (prevStep + 1) % 4;
        if (nextStep === 0) {
          setSimLog("Primary model (Gemini 3.5) active and handling incoming requests.");
        } else if (nextStep === 1) {
          setSimLog("Gemini 3.5 rate-limited or unresponsive. Initiating failover...");
        } else if (nextStep === 2) {
          setSimLog("Failover successful: routing requests to Gemini 2.5.");
        } else if (nextStep === 3) {
          setSimLog("Gemini 2.5 rate-limited. Falling back to GPT-3.");
        }
        return nextStep;
      });
    }, 4500);

    return () => clearInterval(interval);
  }, []);

  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-canvas-gradient)] text-[var(--text-primary)] transition-colors duration-250 flex flex-col font-sans">
      {/* NAVIGATION */}
      <nav className="w-full max-w-[1560px] mx-auto py-6 px-6 md:px-10 flex items-center justify-between z-10">
        <div
          onClick={() => navigate("/")}
          className="flex items-center gap-2.5 cursor-pointer select-none"
        >
          <div className="w-8 h-8 rounded-full bg-[var(--accent-primary)] flex items-center justify-center text-white font-bold text-xs shadow-sm">
            a
          </div>
          <span className="font-bold text-xl tracking-tight font-heading text-[var(--text-primary)]">
            Auvon <span className="text-[var(--accent-primary)]">ai</span>
          </span>
        </div>

        <ul className="hidden md:flex items-center gap-8">
          <li>
            <button
              onClick={() => scrollToSection("features")}
              className="text-[var(--text-secondary)] text-sm font-semibold hover:text-[var(--text-primary)] transition-colors focus:outline-none cursor-pointer"
            >
              Product
            </button>
          </li>
          <li>
            <button
              onClick={() => scrollToSection("architecture")}
              className="text-[var(--text-secondary)] text-sm font-semibold hover:text-[var(--text-primary)] transition-colors focus:outline-none cursor-pointer"
            >
              Architecture
            </button>
          </li>
          <li>
            <button
              onClick={() => navigate("/about")}
              className="text-[var(--text-secondary)] text-sm font-semibold hover:text-[var(--text-primary)] transition-colors focus:outline-none cursor-pointer"
            >
              About
            </button>
          </li>
        </ul>

        {/* Right CTA */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/login")}
            className="auvon-pill-btn-secondary text-xs py-2 px-5 cursor-pointer font-semibold"
          >
            Sign In
          </button>
          <button
            onClick={() => navigate("/register")}
            className="auvon-pill-btn-primary text-xs py-2 px-5 cursor-pointer font-semibold hidden sm:inline-flex"
          >
            Get Started Free
          </button>
        </div>
      </nav>

      {/* HERO SECTION */}
      <header className="relative text-center pt-16 pb-16 px-6 max-w-4xl mx-auto flex flex-col items-center">
        <div className="flex items-center gap-2 mb-5">
          <span className="auvon-telemetry-badge">
            AI LEARNING SYSTEM • DAYLIGHT WORKSPACE
          </span>
        </div>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-[var(--text-primary)] font-heading leading-tight mb-6">
          Cultivate deep focus. <br className="hidden md:block" />
          <span className="text-[var(--accent-primary)]">Master any topic.</span>
        </h1>

        <p className="text-[var(--text-secondary)] text-base md:text-lg leading-relaxed max-w-2xl mb-8">
          A daylight-first study companion designed to bridge reading and deep comprehension.
          Generate structured notes, adaptive checkpoints, and track goals seamlessly.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mb-16 w-full sm:w-auto">
          <button
            onClick={() => navigate("/register")}
            className="auvon-pill-btn-primary px-8 py-3.5 text-sm font-semibold cursor-pointer shadow-lg"
          >
            Get Started Free →
          </button>
          <button
            onClick={() => navigate("/login")}
            className="auvon-pill-btn-secondary px-8 py-3.5 text-sm font-semibold cursor-pointer"
          >
            Sign In to Workspace
          </button>
        </div>

        {/* SCREENSHOT FRAME */}
        <div className="w-full max-w-[1000px] border border-[var(--border-card)] rounded-[24px] bg-[var(--bg-surface)] p-3 shadow-2xl relative overflow-hidden backdrop-blur-xl">
          {/* Virtual Browser Top Bar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] rounded-t-xl">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            </div>
            <div className="text-[11px] text-[var(--text-muted)] font-mono select-none">
              auvon.ai/dashboard
            </div>
            <div className="w-12" />
          </div>

          {/* Screenshot or Fallback UI */}
          <div className="bg-[var(--bg-canvas)] rounded-b-xl overflow-hidden min-h-[420px] flex items-center justify-center p-8">
            {!imgError ? (
              <img
                src="/landingpage.png"
                onError={() => setImgError(true)}
                className="w-full h-auto object-cover object-top rounded-lg shadow-md select-none"
                alt="Auvon.AI Dashboard Preview"
              />
            ) : (
              <div className="w-full flex flex-col gap-6 text-left select-none">
                <div className="auvon-card flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="auvon-telemetry-badge">
                      ACTIVE GOAL • GOAL-042
                    </span>
                    <span className="text-xs font-mono font-semibold text-[var(--accent-primary)]">
                      68% Complete (6/9 steps)
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold font-heading text-[var(--text-primary)]">
                    Machine Learning Foundations & Neural Architectures
                  </h3>
                  <div className="w-full h-2 rounded-full bg-[var(--border-subtle)] p-0.5">
                    <div className="h-full rounded-full bg-[var(--accent-primary)] w-[68%]" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* FEATURES SECTION */}
      <section id="features" className="py-16 px-6 max-w-[1120px] mx-auto w-full mb-20">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="auvon-telemetry-badge">
              CURATED SUITE
            </span>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-[var(--text-primary)] font-heading mb-4">
            Everything you need to study deeper
          </h2>
          <p className="text-[var(--text-secondary)] text-sm md:text-base max-w-lg mx-auto leading-relaxed">
            Three core pillars unified in one sanctuary workspace to streamline learning.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="auvon-card flex flex-col text-left transition-all duration-300 hover:-translate-y-1 group">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center mb-6 text-[var(--accent-primary)] font-bold text-lg shadow-sm">
              ✦
            </div>
            <h3 className="font-bold text-lg text-[var(--text-primary)] font-heading mb-2">
              AI Study Notes
            </h3>
            <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
              Upload PDF textbooks or prompt any concept. Auvon synthesizes clean, reviewable notes with KaTeX math rendering and full citations.
            </p>
          </div>

          {/* Card 2 */}
          <div className="auvon-card flex flex-col text-left transition-all duration-300 hover:-translate-y-1 group">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center mb-6 text-[var(--accent-primary)] font-bold text-lg shadow-sm">
              ?
            </div>
            <h3 className="font-bold text-lg text-[var(--text-primary)] font-heading mb-2">
              Calm Checkpoints
            </h3>
            <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
              Turn any document or topic into calm, multiple-choice quizzes designed to test deep comprehension without stressful timers.
            </p>
          </div>

          {/* Card 3 */}
          <div className="auvon-card flex flex-col text-left transition-all duration-300 hover:-translate-y-1 group">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center mb-6 text-[var(--accent-primary)] font-bold text-lg shadow-sm">
              →
            </div>
            <h3 className="font-bold text-lg text-[var(--text-primary)] font-heading mb-2">
              Goal Roadmaps
            </h3>
            <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
              Track structured, week-by-week goals with integrated YouTube video resources and task completion tracking so momentum never lapses.
            </p>
          </div>
        </div>
      </section>

      {/* ARCHITECTURE SECTION */}
      <section id="architecture" className="px-6 max-w-[1120px] mx-auto w-full mb-24">
        <div className="auvon-card grid grid-cols-1 md:grid-cols-12 gap-8 items-center p-8 md:p-12">
          <div className="md:col-span-7 flex flex-col text-left">
            <div className="flex items-center gap-2 mb-4">
              <span className="auvon-telemetry-badge">
                FAILOVER RESILIENCE
              </span>
            </div>
            <h2 className="text-2xl md:text-4xl font-bold text-[var(--text-primary)] font-heading mb-4 leading-tight">
              Engineered for absolute reliability
            </h2>
            <p className="text-[var(--text-secondary)] text-sm md:text-base leading-relaxed mb-8">
              Auvon routes every AI request through a fault-tolerant multi-tier architecture. If the primary model encounters rate-limits, requests automatically route to secondary fallback channels in real time.
            </p>

            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-[var(--border-subtle)]">
              <div>
                <div className="font-mono text-2xl md:text-3xl font-bold text-[var(--accent-primary)]">3</div>
                <div className="text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider mt-1">Active Models</div>
              </div>
              <div>
                <div className="font-mono text-2xl md:text-3xl font-bold text-[var(--accent-primary)]">1</div>
                <div className="text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider mt-1">Unified Dock</div>
              </div>
              <div>
                <div className="font-mono text-2xl md:text-3xl font-bold text-[var(--accent-primary)]">100%</div>
                <div className="text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-wider mt-1">Automated</div>
              </div>
            </div>
          </div>

          {/* LIVE SIMULATION BOX */}
          <div className="md:col-span-5 flex flex-col gap-4">
            <div className="bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] rounded-2xl p-5 font-mono text-xs text-left shadow-sm">
              <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] pb-3 mb-4 border-b border-[var(--border-subtle)]">
                <span className="font-bold tracking-wider">FAILOVER MONITOR</span>
                <span className="flex items-center gap-1.5 font-bold text-[var(--accent-primary)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-ping" />
                  SIMULATION ACTIVE
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {/* Node 1: Gemini 3.5 */}
                <div
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-300 ${
                    simStep === 0
                      ? "bg-[var(--accent-soft)] border-[var(--accent-primary)] text-[var(--accent-primary)] font-bold"
                      : simStep === 1
                      ? "bg-amber-50 border-amber-300 text-amber-700"
                      : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-muted)] opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        simStep === 0
                          ? "bg-[var(--accent-primary)] animate-pulse"
                          : simStep === 1
                          ? "bg-amber-500 animate-ping"
                          : "bg-red-400"
                      }`}
                    />
                    <span className="text-xs">Gemini 3.5 (Primary)</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider">
                    {simStep === 0 ? "Active" : simStep === 1 ? "Rate Limited" : "Standby"}
                  </span>
                </div>

                {/* Node 2: Gemini 2.5 */}
                <div
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-300 ${
                    simStep === 2
                      ? "bg-[var(--accent-soft)] border-[var(--accent-primary)] text-[var(--accent-primary)] font-bold"
                      : simStep === 3
                      ? "bg-amber-50 border-amber-300 text-amber-700"
                      : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-muted)] opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        simStep === 2
                          ? "bg-[var(--accent-primary)] animate-pulse"
                          : simStep === 3
                          ? "bg-amber-500 animate-ping"
                          : "bg-[var(--text-muted)]"
                      }`}
                    />
                    <span className="text-xs">Gemini 2.5 (Secondary)</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider">
                    {simStep === 2 ? "Active" : simStep === 3 ? "Rate Limited" : "Standby"}
                  </span>
                </div>

                {/* Node 3: GPT-3 */}
                <div
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-300 ${
                    simStep === 3
                      ? "bg-[var(--accent-soft)] border-[var(--accent-primary)] text-[var(--accent-primary)] font-bold"
                      : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-muted)] opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        simStep === 3 ? "bg-[var(--accent-primary)] animate-pulse" : "bg-[var(--text-muted)]"
                      }`}
                    />
                    <span className="text-xs">GPT-3 (Tertiary)</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider">
                    {simStep === 3 ? "Active" : "Standby"}
                  </span>
                </div>
              </div>

              {/* Console log display */}
              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] flex gap-2 items-start">
                <span className="text-[var(--accent-primary)] font-bold">&gt;</span>
                <span className="italic leading-normal">{simLog}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA SECTION */}
      <section className="text-center py-16 px-6 max-w-2xl mx-auto w-full mb-12">
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-[var(--text-primary)] font-heading mb-4">
          Start studying with daylight clarity
        </h2>
        <p className="text-[var(--text-secondary)] text-sm md:text-base mb-8">
          Free to start. No payment information required.
        </p>
        <button
          onClick={() => navigate("/register")}
          className="auvon-pill-btn-primary px-8 py-3.5 text-sm font-semibold cursor-pointer shadow-lg"
        >
          Get Started Free →
        </button>
      </section>

      {/* FOOTER */}
      <footer className="mt-auto border-t border-[var(--border-subtle)] py-8 px-6 w-full max-w-[1120px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="font-heading font-bold text-base text-[var(--text-primary)] select-none">
          auvon<span className="text-[var(--accent-primary)]">.ai</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[var(--text-muted)] text-xs font-mono">
          <button
            onClick={() => navigate("/about")}
            className="hover:text-[var(--text-primary)] transition-colors focus:outline-none cursor-pointer"
          >
            About
          </button>
          <span>•</span>
          <a href="mailto:davevaidik20@gmail.com" className="hover:text-[var(--text-primary)] transition-colors">
            Contact
          </a>
          <span>•</span>
          <a
            href="https://www.linkedin.com/in/vaidik-dave-0457873ab"
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--text-primary)] transition-colors"
          >
            LinkedIn
          </a>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
