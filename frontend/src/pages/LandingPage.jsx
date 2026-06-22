import { useNavigate } from "react-router-dom";

function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-page flex flex-col text-center px-4 py-8 relative">
      <div className="flex-1 flex flex-col justify-center items-center max-w-4xl mx-auto w-full z-10 animate-fade-in">
        <p className="text-accent font-bold tracking-[0.2em] uppercase text-xs mb-8">
          A PRODUCT BY VAIDIK DAVE
        </p>
        
        <h1 className="font-serif text-6xl md:text-8xl text-text-primary mb-6">
          Auvon.AI
        </h1>

        <p className="text-lg md:text-xl text-text-secondary mb-12 max-w-2xl mx-auto leading-relaxed">
          Your intelligent study companion. Generate quizzes, summarize notes, and track your goals with the power of AI.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <button
            onClick={() => navigate("/register")}
            className="w-full sm:w-auto px-8 py-3 bg-accent text-accent-text font-semibold rounded-lg hover:opacity-90 transition-all focus:outline-none focus:ring-2 focus:ring-accent"
          >
            Get Started Free
          </button>

          <button
            onClick={() => navigate("/login")}
            className="w-full sm:w-auto px-8 py-3 bg-control text-text-primary border border-border font-semibold rounded-lg hover:bg-black transition-all focus:outline-none focus:ring-2 focus:ring-accent"
          >
            Sign In
          </button>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="mt-auto flex flex-wrap justify-center gap-6 text-text-tertiary text-sm font-medium z-10 w-full pt-12">
        <button onClick={() => navigate("/about")} className="hover:text-text-primary transition-colors focus:outline-none">
          About Us
        </button>
        <span className="opacity-30 hidden sm:inline">•</span>
        <a href="mailto:davevaidik20@gmail.com" className="hover:text-text-primary transition-colors">Contact</a>
        <span className="opacity-30 hidden sm:inline">•</span>
        <a href="https://www.linkedin.com/in/vaidik-dave-0457873ab" target="_blank" rel="noreferrer" className="hover:text-text-primary transition-colors">LinkedIn</a>
      </div>
    </div>
  );
}

export default LandingPage;
