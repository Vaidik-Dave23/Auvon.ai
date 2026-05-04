import { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Sidebar from "../components/Sidebar";

function NoteReader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();

  const [note, setNote] = useState(location.state || null);

  useEffect(() => {
    // If not in state, ideally we fetch by ID here. 
    // For now we assume state is passed. If not, redirect back.
    if (!note) {
      navigate("/notes");
    }
  }, [note, navigate]);

  if (!note) return null;

  return (
    <div className="min-h-screen bg-base p-6 flex gap-6">
      <Sidebar />

      <div className="flex-1 animate-fade-in flex flex-col items-center">
        <div className="w-full max-w-4xl flex justify-between items-center mb-8 pt-4">
          <button 
            onClick={() => navigate("/notes")} 
            className="flex items-center gap-2 text-textMuted hover:text-accent transition-colors font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back to Library
          </button>
          
          <button 
            onClick={() => {
              // Copy to clipboard or generate test from this note.
              navigator.clipboard.writeText(note.content);
              alert("Copied to clipboard!");
            }}
            className="glass-button px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy Text
          </button>
        </div>

        <div className="w-full max-w-4xl glass-panel p-8 md:p-12 rounded-3xl border-white/5 shadow-2xl relative mb-12">
          {/* Subtle accent border top */}
          <div className="absolute top-0 left-10 right-10 h-1 bg-gradient-to-r from-transparent via-accent to-transparent opacity-50" />
          
          <h1 className="text-3xl md:text-5xl font-bold text-textMain mb-10 leading-tight">
            {note.title}
          </h1>

          <div className="prose prose-invert max-w-none text-textMain/90 text-lg leading-relaxed">
            {note.content.split('\n').map((paragraph, idx) => {
              // Very basic markdown parsing for headings and lists just to make it readable
              if (paragraph.startsWith('### ')) {
                return <h3 key={idx} className="text-2xl font-bold mt-8 mb-4 text-accent">{paragraph.replace('### ', '')}</h3>;
              } else if (paragraph.startsWith('## ')) {
                return <h2 key={idx} className="text-3xl font-bold mt-10 mb-5 text-accentHover">{paragraph.replace('## ', '')}</h2>;
              } else if (paragraph.startsWith('# ')) {
                return <h1 key={idx} className="text-4xl font-extrabold mt-12 mb-6 text-textMain">{paragraph.replace('# ', '')}</h1>;
              } else if (paragraph.startsWith('- ') || paragraph.startsWith('* ')) {
                return <li key={idx} className="ml-6 mb-2">{paragraph.substring(2)}</li>;
              } else if (paragraph.trim() === '') {
                return <br key={idx} />;
              }
              return <p key={idx} className="mb-4">{paragraph}</p>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default NoteReader;
