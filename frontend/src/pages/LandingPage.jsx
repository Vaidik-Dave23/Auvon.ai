import { useNavigate } from "react-router-dom";
import AuvonLogo from "../components/AuvonLogo";

function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-base relative overflow-x-hidden flex flex-col text-center px-4 py-8">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent/20 rounded-full blur-[100px] pointer-events-none animate-pulse-glow" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none animate-pulse-glow" style={{ animationDelay: '1s' }} />

      <div className="flex-1 flex flex-col justify-center items-center z-10 animate-slide-up max-w-4xl mx-auto w-full mt-12 md:mt-0">
        <p className="text-accent font-bold tracking-[0.2em] uppercase text-sm mb-6">A PRODUCT BY VAIDIK DAVE</p>
        
        <AuvonLogo className="w-48 h-48 md:w-64 md:h-64 mb-4 drop-shadow-[0_0_30px_rgba(139,92,246,0.3)]" />
        
        <h1 className="text-6xl md:text-8xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-textMain via-accentHover to-accent mb-6 pb-2">
          Auvon.AI
        </h1>

        <p className="text-xl md:text-2xl text-textMuted mb-12 max-w-2xl mx-auto leading-relaxed">
          Your intelligent study companion. Generate quizzes, summarize notes, and track your goals with the power of AI.
        </p>

        <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
          <button
            onClick={() => navigate("/register")}
            className="w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-accent to-accentHover text-white font-bold text-lg rounded-full shadow-[0_0_30px_rgba(139,92,246,0.3)] hover:shadow-[0_0_50px_rgba(139,92,246,0.5)] hover:scale-105 active:scale-95 transition-all"
          >
            Get Started Free
          </button>

          <button
            onClick={() => navigate("/login")}
            className="w-full sm:w-auto px-10 py-4 glass-panel text-textMain font-bold text-lg rounded-full hover:bg-white/10 transition-all active:scale-95 border border-white/20"
          >
            Sign In
          </button>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="mt-12 flex flex-wrap justify-center gap-6 text-textMuted text-sm font-medium z-10 w-full">
        <button onClick={() => navigate("/about")} className="hover:text-accent transition-colors">
          About Us
        </button>
        <span className="opacity-30 hidden sm:inline">•</span>
        <a href="mailto:davevaidik20@gmail.com" className="hover:text-accent transition-colors">Contact</a>
        <span className="opacity-30 hidden sm:inline">•</span>
        <a href="https://www.linkedin.com/in/vaidik-dave-0457873ab" target="_blank" rel="noreferrer" className="hover:text-accent transition-colors">LinkedIn</a>
      </div>
    </div>
  );
}

export default LandingPage;
