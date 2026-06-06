import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import api from "../api/axios";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";

function NoteReader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();

  const [note, setNote] = useState(location.state || null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);

  const chatEndRef = useRef(null);

  // Auto-scroll chat area on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  // Fetch note by ID if not passed in routing state
  useEffect(() => {
    if (!note) {
      const fetchNote = async () => {
        try {
          const res = await api.get("/notes/my");
          const found = res.data.find((n) => String(n.id) === String(id));
          if (found) {
            setNote(found);
          } else {
            navigate("/notes");
          }
        } catch (err) {
          console.error("Failed to fetch note:", err);
          navigate("/notes");
        }
      };
      fetchNote();
    }
  }, [note, id, navigate]);

  const handleSendQuestion = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setChatLoading(true);

    try {
      const res = await api.post(`/notes/${id}/query?query=${encodeURIComponent(userMessage)}`);
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: res.data.answer,
          sources: res.data.sources,
        },
      ]);
    } catch (err) {
      console.error(err);
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Sorry, I encountered an error while searching the document. Please try again.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  if (!note) return null;

  return (
    <div className="min-h-screen bg-base p-6 flex gap-6">
      <Sidebar />

      <div className="flex-1 animate-fade-in flex flex-col">
        {/* Header */}
        <div className="w-full flex justify-between items-center mb-8 pt-4">
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
              navigator.clipboard.writeText(note.content);
              alert("Copied to clipboard!");
            }}
            className="glass-button px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 text-textMain"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy Text
          </button>
        </div>

        {/* Split Screen Container */}
        <div className="flex-1 flex flex-col lg:flex-row gap-6 items-stretch">

          {/* LEFT: Study Notes Content */}
          <div className="w-full lg:w-3/5 glass-panel p-8 md:p-12 rounded-3xl border-white/5 shadow-2xl relative overflow-y-auto max-h-[calc(100vh-140px)]">
            <div className="absolute top-0 left-10 right-10 h-1 bg-gradient-to-r from-transparent via-accent to-transparent opacity-50" />

            <h1 className="text-3xl md:text-4xl font-bold text-textMain mb-10 leading-tight">
              {note.title}
            </h1>

            <div className="prose prose-invert max-w-none text-textMain/90 text-lg leading-relaxed">
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  h1: ({ children }) => <h1 className="text-4xl font-extrabold mt-12 mb-6 text-textMain">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-3xl font-bold mt-10 mb-5 text-accentHover">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-2xl font-bold mt-8 mb-4 text-accent">{children}</h3>,
                  p: ({ children }) => <p className="mb-4">{children}</p>,
                  li: ({ children }) => <li className="ml-6 mb-2">{children}</li>,
                  code: ({ inline, children }) =>
                    inline
                      ? <code className="bg-white/10 text-accent px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
                      : <pre className="bg-white/5 border border-white/10 rounded-xl p-4 overflow-x-auto text-sm font-mono my-4"><code>{children}</code></pre>,
                }}
              >
                {note.content}
              </ReactMarkdown>
            </div>
          </div>

          {/* RIGHT: Document Q&A Chat Panel */}
          <div className="w-full lg:w-2/5 glass-panel rounded-3xl border-white/5 shadow-2xl flex flex-col max-h-[calc(100vh-140px)] overflow-hidden">
            {/* Panel Title Header */}
            <div className="p-5 border-b border-white/10 flex items-center gap-3 bg-card/20 backdrop-blur-sm">
              <span className="w-3 h-3 rounded-full bg-accent animate-pulse" />
              <h2 className="font-bold text-lg text-textMain">Ask Document Q&A</h2>
            </div>

            {/* Conversation Log */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 flex flex-col">
              {chatMessages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-textMuted/60 p-6">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-14 w-14 mb-4 text-accent/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <p className="text-base font-semibold text-textMain/80">Ask questions about this note!</p>
                  <p className="text-xs text-textMuted mt-2 max-w-xs leading-relaxed">
                    AI will perform semantic search over the document context to retrieve answers and source snippets.
                  </p>
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} w-full`}>
                    <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${msg.role === "user"
                      ? "bg-accent text-white rounded-br-none shadow-[0_4px_15px_rgba(139,92,246,0.15)]"
                      : "bg-cardHover border border-white/5 text-textMain rounded-bl-none"
                      }`}>
                      {msg.text}
                    </div>

                    {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-2 pl-3 border-l-2 border-accent/20 space-y-1 w-[85%]">
                        <p className="text-[10px] text-accent/80 font-bold uppercase tracking-wider">Retrieved Context:</p>
                        {msg.sources.map((src, sIdx) => (
                          <p key={sIdx} className="text-[11px] text-textMuted line-clamp-2 italic" title={src}>
                            • "{src}"
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}

              {chatLoading && (
                <div className="flex items-start">
                  <div className="bg-cardHover border border-white/5 p-4 rounded-2xl rounded-bl-none flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2.5 h-2.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2.5 h-2.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Q&A Input Box */}
            <form onSubmit={handleSendQuestion} className="p-4 border-t border-white/10 bg-card/10 backdrop-blur-sm flex gap-3">
              <input
                type="text"
                placeholder="Ask a question about this document..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={chatLoading}
                className="flex-1 bg-cardHover border border-white/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent/40 text-textMain placeholder:text-textMuted/40 transition-colors"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className={`p-3 rounded-xl flex items-center justify-center text-white transition-all ${chatLoading || !chatInput.trim()
                  ? "bg-cardHover text-textMuted cursor-not-allowed border border-white/5"
                  : "bg-accent hover:bg-accentHover hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(139,92,246,0.25)]"
                  }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}

export default NoteReader;

