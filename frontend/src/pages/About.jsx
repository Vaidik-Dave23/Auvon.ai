import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar"; // Assuming Sidebar is needed, but typically About is public. 
// Actually, let's make it a clean public page like Landing, but with a Back button.

function About() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-base relative overflow-hidden py-12 px-6 flex justify-center">
      {/* Background Orbs */}
      <div className="absolute top-0 right-0 w-[50%] h-[50%] bg-accent/10 rounded-full blur-[150px] pointer-events-none" />
      
      <div className="max-w-3xl w-full z-10 animate-slide-up">
        <button 
          onClick={() => navigate(-1)} 
          className="flex items-center gap-2 text-textMuted hover:text-accent mb-12 transition-colors font-medium"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back
        </button>

        <h1 className="text-5xl font-extrabold text-textMain mb-8 tracking-tight">About <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-accentHover">Auvon.AI</span></h1>
        
        <div className="glass-panel p-8 md:p-10 rounded-3xl mb-8 border-white/5 space-y-6 text-lg leading-relaxed text-textMuted">
          <p>
            Welcome to <strong className="text-textMain">Auvon.AI</strong>, a state-of-the-art educational platform designed to transform the way you learn and study. 
          </p>
          <p>
            Our mission is to harness the power of advanced Artificial Intelligence to create personalized, interactive, and highly effective learning experiences. Whether you need to break down complex topics into digestible notes, set structured long-term goals, or test your knowledge with dynamically generated quizzes, Auvon.AI is your ultimate study companion.
          </p>
          <p>
            Built with modern web technologies and a focus on premium user experience, we believe that education software should be as beautiful and intuitive as it is smart.
          </p>
        </div>

        <div className="glass-panel p-8 rounded-3xl border-accent/20 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          <p className="text-sm font-bold tracking-widest uppercase text-accent mb-6">Developer Details</p>
          
          <h2 className="text-3xl font-bold text-textMain mb-2">Vaidik Dave</h2>
          <p className="text-textMuted mb-8">Creator & Lead Developer</p>

          <div className="flex flex-col sm:flex-row gap-4">
            <a 
              href="mailto:davevaidik20@gmail.com" 
              className="glass-button flex items-center justify-center gap-3 px-6 py-3 rounded-xl text-textMain font-medium hover:text-accent transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
              davevaidik20@gmail.com
            </a>

            <a 
              href="https://www.linkedin.com/in/vaidik-dave-0457873ab" 
              target="_blank" 
              rel="noreferrer"
              className="glass-button flex items-center justify-center gap-3 px-6 py-3 rounded-xl text-textMain font-medium hover:text-accent transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
              </svg>
              LinkedIn Profile
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default About;
