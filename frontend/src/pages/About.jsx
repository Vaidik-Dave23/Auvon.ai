import { useNavigate } from "react-router-dom";

function About() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-page py-12 px-6 flex justify-center text-text-primary">
      <div className="max-w-3xl w-full animate-fade-in flex flex-col">
        <button 
          onClick={() => navigate(-1)} 
          className="flex items-center gap-2 text-text-tertiary hover:text-text-primary mb-12 transition-colors font-medium text-sm focus:outline-none"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back
        </button>

        <h1 className="font-serif text-4xl font-semibold text-text-primary mb-8">
          About Auvon.AI
        </h1>
        
        <div className="bg-surface border border-border p-8 rounded-xl mb-8 space-y-6 text-sm md:text-base leading-relaxed text-text-secondary">
          <p>
            Welcome to <strong className="text-text-primary font-medium">Auvon.AI</strong>, a state-of-the-art educational platform designed to transform the way you learn and study. 
          </p>
          <p>
            Our mission is to harness the power of advanced Artificial Intelligence to create personalized, interactive, and highly effective learning experiences. Whether you need to break down complex topics into digestible notes, set structured long-term goals, or test your knowledge with dynamically generated quizzes, Auvon.AI is your ultimate study companion.
          </p>
          <p>
            Built with modern web technologies and a focus on premium user experience, we believe that education software should be as beautiful and intuitive as it is smart.
          </p>
        </div>

        <div className="bg-surface-alt border border-border p-8 rounded-xl">
          <p className="text-xs font-semibold tracking-widest uppercase text-accent mb-4">
            Developer Details
          </p>
          
          <h2 className="font-serif text-2xl font-semibold text-text-primary mb-1">
            Vaidik Dave
          </h2>
          <p className="text-text-tertiary text-sm mb-8 font-medium">
            Creator & Lead Developer
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <a 
              href="mailto:davevaidik20@gmail.com" 
              className="bg-control text-text-primary border border-border flex items-center justify-center gap-3 px-6 py-3 rounded-lg text-sm font-semibold hover:bg-black transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
              davevaidik20@gmail.com
            </a>

            <a 
              href="https://www.linkedin.com/in/vaidik-dave-0457873ab" 
              target="_blank" 
              rel="noreferrer"
              className="bg-control text-text-primary border border-border flex items-center justify-center gap-3 px-6 py-3 rounded-lg text-sm font-semibold hover:bg-black transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
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
