import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

function LandingPage() {
  const navigate = useNavigate();

  // State for image handling
  const [imgError, setImgError] = useState(false);

  // State for Architecture Live Simulation
  // 0: Gemini 3.5 Active, others Standby
  // 1: Gemini 3.5 Latency/Rate Limit, checking failover
  // 2: Gemini 2.5 Active, Gemini 3.5 Failed, GPT-3 Standby
  // 3: GPT-3 Active, Gemini 2.5 rate limited, Gemini 3.5 Failed
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
    <div className="min-h-screen bg-page text-text-primary selection:bg-accent selection:text-white transition-colors duration-300 flex flex-col font-sans">
      
      {/* NAVIGATION */}
      <nav className="w-full max-w-[1100px] mx-auto py-7 px-8 flex items-center justify-between z-10">
        <div 
          onClick={() => navigate("/")} 
          className="font-serif text-2xl font-semibold tracking-wide cursor-pointer hover:opacity-90 transition-opacity"
        >
          Auvon.AI
        </div>
        <ul className="hidden md:flex items-center gap-8">
          <li>
            <button 
              onClick={() => scrollToSection("features")} 
              className="text-text-secondary text-sm font-medium hover:text-text-primary transition-colors focus:outline-none"
            >
              Product
            </button>
          </li>
          <li>
            <button 
              onClick={() => scrollToSection("architecture")} 
              className="text-text-secondary text-sm font-medium hover:text-text-primary transition-colors focus:outline-none"
            >
              Architecture
            </button>
          </li>
          <li>
            <button 
              onClick={() => navigate("/about")} 
              className="text-text-secondary text-sm font-medium hover:text-text-primary transition-colors focus:outline-none"
            >
              About
            </button>
          </li>
        </ul>
        <button 
          onClick={() => navigate("/login")}
          className="bg-transparent border border-border px-5 py-2.5 rounded-lg text-sm font-semibold hover:border-text-secondary hover:bg-surface/20 transition-all focus:outline-none focus:ring-2 focus:ring-accent"
        >
          Sign In
        </button>
      </nav>

      {/* HERO SECTION */}
      <header className="relative text-center pt-20 pb-16 px-8 max-w-4xl mx-auto flex flex-col items-center">
        <div className="text-accent text-[11px] font-bold tracking-[0.25em] uppercase mb-5 animate-fade-in">
          A product by Vaidik Dave
        </div>
        <h1 className="font-serif text-5xl md:text-7xl lg:text-[76px] font-light leading-[1.1] mb-7 animate-slide-up">
          Auvon.AI
        </h1>
        <p className="text-text-secondary text-lg md:text-xl leading-relaxed max-w-2xl mb-10 animate-slide-up">
          Your intelligent study companion. Generate quizzes, summarize notes, and track your goals with the power of AI.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 mb-20 w-full sm:w-auto animate-slide-up">
          <button
            onClick={() => navigate("/register")}
            className="px-8 py-3.5 bg-accent text-accent-text font-bold rounded-lg shadow-lg hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] transition-all focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-page"
          >
            Get Started Free
          </button>
          <button
            onClick={() => navigate("/login")}
            className="px-8 py-3.5 bg-control text-text-primary border border-border font-bold rounded-lg hover:bg-surface transition-all focus:outline-none focus:ring-2 focus:ring-accent"
          >
            Sign In
          </button>
        </div>

        {/* SCREENSHOT FRAME */}
        <div className="w-full max-w-[900px] border border-border rounded-2xl bg-surface-alt p-2.5 shadow-2xl relative overflow-hidden group">
          {/* Virtual Browser Top Bar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-surface/50 rounded-t-xl">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-danger/70"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-success/70"></div>
            </div>
            <div className="text-[10px] text-text-tertiary font-mono select-none">auvon.ai/dashboard</div>
            <div className="w-12"></div>
          </div>

          {/* Screenshot or Fallback UI */}
          <div className="bg-page rounded-b-xl overflow-hidden min-h-[440px] flex">
            {!imgError ? (
              <img
                src="/landingpage.png"
                onError={() => setImgError(true)}
                className="w-full h-auto object-cover object-top select-none"
                alt="Auvon.AI Dashboard Preview"
              />
            ) : (
              /* Gorgeous, responsive dashboard skeleton preview fallback */
              <div className="w-full p-6 flex flex-col md:flex-row gap-6 font-sans text-left select-none">
                {/* Sidebar */}
                <div className="w-full md:w-1/4 border-b md:border-b-0 md:border-r border-border/40 pb-4 md:pb-0 md:pr-6 flex flex-col gap-4">
                  <div className="h-6 bg-surface-alt rounded w-2/3"></div>
                  <div className="h-[1px] bg-border/40 w-full my-1"></div>
                  <div className="h-9 bg-accent/10 rounded flex items-center px-3 gap-2.5 border border-accent/20">
                    <div className="w-2 h-2 rounded-full bg-accent animate-ping"></div>
                    <div className="h-3.5 bg-accent/40 rounded w-1/2"></div>
                  </div>
                  <div className="h-9 bg-surface rounded flex items-center px-3">
                    <div className="h-3 bg-text-tertiary/40 rounded w-1/3"></div>
                  </div>
                  <div className="h-9 bg-surface rounded flex items-center px-3">
                    <div className="h-3 bg-text-tertiary/40 rounded w-2/5"></div>
                  </div>
                  <div className="h-9 bg-surface rounded flex items-center px-3">
                    <div className="h-3 bg-text-tertiary/40 rounded w-1/2"></div>
                  </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col gap-6">
                  <div className="flex justify-between items-center">
                    <div className="h-7 bg-surface-alt rounded w-1/3"></div>
                    <div className="h-9 bg-accent/80 rounded-lg w-28"></div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="border border-border/40 p-4 rounded-xl bg-surface/30 flex flex-col gap-3">
                      <div className="h-3.5 bg-text-secondary/20 rounded w-1/2"></div>
                      <div className="h-8 bg-text-primary/10 rounded w-1/3"></div>
                    </div>
                    <div className="border border-border/40 p-4 rounded-xl bg-surface/30 flex flex-col gap-3">
                      <div className="h-3.5 bg-text-secondary/20 rounded w-2/3"></div>
                      <div className="h-8 bg-text-primary/10 rounded w-1/4"></div>
                    </div>
                  </div>

                  {/* Mock study session box */}
                  <div className="border border-border/60 p-5 rounded-xl bg-surface-alt/40 flex-1 flex flex-col gap-3 justify-end min-h-[180px]">
                    <div className="text-xs text-text-tertiary italic text-center mb-auto pt-2">
                      Upload your dashboard screenshot file as <code className="bg-[#101010] px-1.5 py-0.5 rounded border border-border/60 text-accent font-semibold text-[10px] not-italic">landingpage.png</code> into the <code className="bg-[#101010] px-1.5 py-0.5 rounded border border-border/60 text-accent font-semibold text-[10px] not-italic">frontend/public/</code> directory to display it here.
                    </div>
                    <div className="bg-surface p-3.5 rounded-xl border border-border/40 self-start max-w-[85%] text-xs text-text-secondary shadow-sm">
                      Could you summarize these notes and create an interactive study quiz?
                    </div>
                    <div className="bg-accent/15 p-3.5 rounded-xl border border-accent/20 self-end max-w-[85%] text-xs text-accent-text flex flex-col gap-2.5 shadow-sm">
                      <span>Analyzing materials and generating multiple-choice assessment questions...</span>
                      <div className="w-full bg-surface-alt h-1.5 rounded-full overflow-hidden">
                        <div className="bg-accent h-full w-[70%] animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* FEATURES SECTION */}
      <section id="features" className="py-12 px-8 max-w-[1000px] mx-auto w-full mb-32">
        <div className="text-center mb-16">
          <div className="text-accent text-[11px] font-bold tracking-[0.25em] uppercase mb-4">
            What it does
          </div>
          <h2 className="font-serif text-4xl md:text-5xl font-light mb-5">
            Everything you need to study smarter
          </h2>
          <p className="text-text-secondary text-base max-w-lg mx-auto leading-relaxed">
            Three tools, one workspace — built to cut the time between reading and remembering.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-surface-alt border border-border rounded-2xl p-8 flex flex-col text-left transition-all duration-300 hover:border-accent/60 hover:-translate-y-1 shadow-lg group">
            <div className="w-11 h-11 rounded-lg bg-accent/10 flex items-center justify-center mb-6 text-accent group-hover:bg-accent group-hover:text-white transition-all duration-300">
              <span className="font-serif text-base font-bold">Aa</span>
            </div>
            <h3 className="font-semibold text-lg text-text-primary mb-3">AI notes</h3>
            <p className="text-text-secondary text-sm leading-relaxed">
              Upload a PDF or paste your notes. Auvon restructures and summarizes them into clean, reviewable study material.
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-surface-alt border border-border rounded-2xl p-8 flex flex-col text-left transition-all duration-300 hover:border-accent/60 hover:-translate-y-1 shadow-lg group">
            <div className="w-11 h-11 rounded-lg bg-accent/10 flex items-center justify-center mb-6 text-accent group-hover:bg-accent group-hover:text-white transition-all duration-300 font-bold">
              ?
            </div>
            <h3 className="font-semibold text-lg text-text-primary mb-3">Quiz generation</h3>
            <p className="text-text-secondary text-sm leading-relaxed">
              Turn any document into an MCQ test in seconds, scoped to the topics that actually matter.
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-surface-alt border border-border rounded-2xl p-8 flex flex-col text-left transition-all duration-300 hover:border-accent/60 hover:-translate-y-1 shadow-lg group">
            <div className="w-11 h-11 rounded-lg bg-accent/10 flex items-center justify-center mb-6 text-accent group-hover:bg-accent group-hover:text-white transition-all duration-300 font-bold">
              →
            </div>
            <h3 className="font-semibold text-lg text-text-primary mb-3">Goal tracking</h3>
            <p className="text-text-secondary text-sm leading-relaxed">
              Set study goals and track progress over time, so momentum doesn't quietly disappear mid-semester.
            </p>
          </div>
        </div>
      </section>

      {/* ARCHITECTURE SECTION */}
      <section id="architecture" className="px-8 max-w-[1000px] mx-auto w-full mb-32">
        <div className="bg-surface border border-border rounded-2xl p-8 md:p-12 grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-center">
          <div className="md:col-span-7 flex flex-col text-left">
            <div className="text-accent text-[11px] font-bold tracking-[0.25em] uppercase mb-4">Under the hood</div>
            <h2 className="font-serif text-3xl md:text-4xl font-light text-text-primary mb-5 leading-tight">
              Built for reliability, not just demos
            </h2>
            <p className="text-text-secondary text-[15px] leading-relaxed mb-8">
              Auvon routes every AI request through a fault-tolerant, model failover system. If the primary Gemini 3.5 model is rate-limited or down, requests automatically route to secondary fallback channels (Gemini 2.5 and GPT-3) in real-time.
            </p>

            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-border/40">
              <div>
                <div className="font-serif text-2xl md:text-3xl text-text-primary">3</div>
                <div className="text-[10px] text-text-tertiary uppercase tracking-widest mt-1 font-semibold">Active Models</div>
              </div>
              <div>
                <div className="font-serif text-2xl md:text-3xl text-text-primary">1</div>
                <div className="text-[10px] text-text-tertiary uppercase tracking-widest mt-1 font-semibold">Workspace</div>
              </div>
              <div>
                <div className="font-serif text-2xl md:text-3xl text-text-primary">100%</div>
                <div className="text-[10px] text-text-tertiary uppercase tracking-widest mt-1 font-semibold">Automated</div>
              </div>
            </div>
          </div>

          {/* LIVE SIMULATION BOX */}
          <div className="md:col-span-5 flex flex-col gap-4">
            <div className="bg-[#101010] border border-border rounded-xl p-5 font-mono text-xs text-left shadow-inner">
              <div className="flex items-center justify-between text-[9px] text-text-tertiary pb-3 mb-4 border-b border-border/20">
                <span className="font-bold tracking-wider">FAILOVER MONITOR</span>
                <span className="flex items-center gap-1.5 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-ping"></span>
                  LIVE SIMULATION
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {/* Node 1: Gemini 3.5 */}
                <div
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all duration-300 ${
                    simStep === 0
                      ? "bg-accent/10 border-accent text-text-primary"
                      : simStep === 1
                      ? "bg-yellow-500/10 border-yellow-500/50 text-yellow-500"
                      : "bg-surface/30 border-border/40 text-text-tertiary opacity-50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${
                        simStep === 0
                          ? "bg-success animate-pulse"
                          : simStep === 1
                          ? "bg-yellow-500 animate-ping"
                          : "bg-danger"
                      }`}
                    ></span>
                    <span className="text-xs">Gemini 3.5 (Primary)</span>
                  </div>
                  <span className="text-[9px] uppercase font-bold tracking-wider">
                    {simStep === 0 ? "Active" : simStep === 1 ? "Rate Limit Check" : "Failed"}
                  </span>
                </div>

                {/* Node 2: Gemini 2.5 */}
                <div
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all duration-300 ${
                    simStep === 2
                      ? "bg-accent/10 border-accent text-text-primary"
                      : simStep === 3
                      ? "bg-yellow-500/10 border-yellow-500/50 text-yellow-500 text-opacity-80"
                      : "bg-surface/30 border-border/40 text-text-tertiary opacity-50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${
                        simStep === 2
                          ? "bg-success animate-pulse"
                          : simStep === 3
                          ? "bg-yellow-500 animate-ping"
                          : "bg-text-tertiary/30"
                      }`}
                    ></span>
                    <span className="text-xs">Gemini 2.5 (Secondary)</span>
                  </div>
                  <span className="text-[9px] uppercase font-bold tracking-wider">
                    {simStep === 2 ? "Active" : simStep === 3 ? "Rate Limited" : "Standby"}
                  </span>
                </div>

                {/* Node 3: GPT-3 */}
                <div
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all duration-300 ${
                    simStep === 3
                      ? "bg-accent/10 border-accent text-text-primary"
                      : "bg-surface/30 border-border/40 text-text-tertiary opacity-50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${
                        simStep === 3 ? "bg-success animate-pulse" : "bg-text-tertiary/30"
                      }`}
                    ></span>
                    <span className="text-xs">GPT-3 (Tertiary)</span>
                  </div>
                  <span className="text-[9px] uppercase font-bold tracking-wider">
                    {simStep === 3 ? "Active" : "Standby"}
                  </span>
                </div>
              </div>

              {/* Console log display */}
              <div className="mt-4 pt-3 border-t border-border/20 text-[10px] text-text-secondary flex gap-2 items-start">
                <span className="text-accent font-bold">&gt;</span>
                <span className="italic leading-normal">{simLog}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA SECTION */}
      <section className="text-center py-20 px-8 max-w-2xl mx-auto w-full mb-16">
        <h2 className="font-serif text-4xl md:text-5xl font-light mb-5">
          Start studying smarter today
        </h2>
        <p className="text-text-secondary text-sm md:text-base mb-8">
          Free to start. No credit card required.
        </p>
        <button
          onClick={() => navigate("/register")}
          className="px-8 py-3.5 bg-accent text-accent-text font-bold rounded-lg shadow-lg hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] transition-all focus:outline-none focus:ring-2 focus:ring-accent"
        >
          Get Started Free
        </button>
      </section>

      {/* FOOTER */}
      <footer className="mt-auto border-t border-border/60 py-10 px-8 w-full max-w-[1100px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="logo font-serif text-lg font-semibold select-none">
          Auvon.AI
        </div>
        <div className="flex flex-wrap items-center gap-2.5 text-text-tertiary text-xs">
          <button 
            onClick={() => navigate("/about")} 
            className="hover:text-text-primary transition-colors focus:outline-none"
          >
            About Us
          </button>
          <span>·</span>
          <a href="mailto:davevaidik20@gmail.com" className="hover:text-text-primary transition-colors">
            Contact
          </a>
          <span>·</span>
          <a 
            href="https://www.linkedin.com/in/vaidik-dave-0457873ab" 
            target="_blank" 
            rel="noreferrer" 
            className="hover:text-text-primary transition-colors"
          >
            LinkedIn
          </a>
        </div>
      </footer>

    </div>
  );
}

export default LandingPage;
