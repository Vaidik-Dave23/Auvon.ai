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
  const [loading, setLoading] = useState(!note);

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
        } finally {
          setLoading(false);
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

  return (
    <div className="min-h-screen bg-page flex text-text-primary font-sans">
      <Sidebar />

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 h-screen overflow-y-auto p-8 flex flex-col gap-6 animate-fade-in">
        {/* Header Controls */}
        <div className="w-full flex justify-between items-center">
          <button
            onClick={() => navigate("/notes")}
            className="flex items-center gap-2 text-text-tertiary hover:text-text-primary transition-colors font-medium text-sm focus:outline-none"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back to Library
          </button>

          {note && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(note.content);
                alert("Copied to clipboard!");
              }}
              className="px-4 py-2 border border-border text-text-secondary rounded-lg text-sm font-semibold hover:text-text-primary hover:bg-surface-alt transition-colors focus:outline-none"
            >
              Copy Text
            </button>
          )}
        </div>

        {/* Loading Skeleton state */}
        {loading ? (
          <div className="flex-1 flex gap-6 items-stretch">
            <div className="w-full lg:w-3/5 bg-surface border border-border p-8 rounded-xl space-y-6">
              <div className="h-8 w-1/3 bg-surface-alt rounded animate-pulse" />
              <div className="space-y-4">
                <div className="h-4 bg-surface-alt rounded w-full animate-pulse" />
                <div className="h-4 bg-surface-alt rounded w-5/6 animate-pulse" />
                <div className="h-4 bg-surface-alt rounded w-4/5 animate-pulse" />
                <div className="h-4 bg-surface-alt rounded w-full animate-pulse" />
              </div>
            </div>
            <div className="hidden lg:block lg:w-2/5 bg-surface border border-border rounded-xl animate-pulse" />
          </div>
        ) : (
          note && (
            <div className="flex-1 flex flex-col lg:flex-row gap-6 items-stretch min-h-0">
              {/* LEFT: Study Notes Content */}
              <div className="w-full lg:w-3/5 bg-surface border border-border p-8 rounded-xl overflow-y-auto max-h-[calc(100vh-160px)]">
                <h1 className="font-serif text-3xl font-semibold text-text-primary mb-8 leading-tight">
                  {note.title}
                </h1>

                <div className="prose prose-invert max-w-none text-text-secondary text-base leading-relaxed font-sans">
                  <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      h1: ({ children }) => <h1 className="font-serif text-2xl font-semibold mt-8 mb-4 text-text-primary border-b border-border pb-2">{children}</h1>,
                      h2: ({ children }) => <h2 className="font-serif text-xl font-medium mt-6 mb-3 text-text-primary">{children}</h2>,
                      h3: ({ children }) => <h3 className="font-serif text-lg font-medium mt-4 mb-2 text-text-primary">{children}</h3>,
                      p: ({ children }) => <p className="mb-4 text-text-secondary">{children}</p>,
                      li: ({ children }) => <li className="ml-6 mb-2 list-disc text-text-secondary">{children}</li>,
                      ul: ({ children }) => <ul className="mb-4">{children}</ul>,
                      ol: ({ children }) => <ol className="mb-4 list-decimal pl-4">{children}</ol>,
                      code: ({ inline, children }) =>
                        inline
                          ? <code className="bg-surface-alt border border-border-subtle text-accent px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
                          : <pre className="bg-input border border-border rounded-lg p-4 overflow-x-auto text-sm font-mono my-4 text-text-primary"><code>{children}</code></pre>,
                    }}
                  >
                    {note.content}
                  </ReactMarkdown>
                </div>
              </div>

              {/* RIGHT: Document Q&A Chat Panel */}
              <div className="w-full lg:w-2/5 bg-surface border border-border rounded-xl flex flex-col max-h-[calc(100vh-160px)] overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-border bg-surface flex items-center gap-2 flex-shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
                  <h2 className="font-serif text-lg font-medium text-text-primary">
                    Ask Document Q&A
                  </h2>
                </div>

                {/* Conversation Log */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col min-h-0">
                  {chatMessages.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 my-auto">
                      <p className="text-sm font-semibold text-text-primary">
                        Ask questions about this note!
                      </p>
                      <p className="text-xs text-text-tertiary mt-2 max-w-xs leading-relaxed">
                        AI will perform semantic search over the document context to retrieve answers and source snippets.
                      </p>
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <div key={idx} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} w-full`}>
                        <div className={`max-w-[85%] p-3.5 rounded-lg text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-accent text-accent-text rounded-br-none"
                            : "bg-surface-alt border border-border-subtle text-text-primary rounded-bl-none"
                        }`}>
                          {msg.role === "user" ? (
                            msg.text
                          ) : (
                            <ReactMarkdown
                              remarkPlugins={[remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                              components={{
                                p: ({ children }) => <p className="mb-2 last:mb-0 text-text-secondary">{children}</p>,
                                h3: ({ children }) => <h3 className="font-serif text-sm font-semibold mt-3 mb-1 text-text-primary">{children}</h3>,
                                li: ({ children }) => <li className="ml-4 mb-1 list-disc text-text-secondary">{children}</li>,
                                code: ({ inline, children }) =>
                                  inline
                                    ? <code className="bg-surface-alt text-accent px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                                    : <pre className="bg-input border border-border rounded p-3 overflow-x-auto text-xs font-mono my-2 text-text-primary"><code>{children}</code></pre>,
                              }}
                            >
                              {msg.text}
                            </ReactMarkdown>
                          )}
                        </div>

                        {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                          <div className="mt-2 pl-3 border-l-2 border-border-subtle space-y-1 w-[85%]">
                            <p className="text-[9px] text-text-tertiary font-bold uppercase tracking-wider">
                              Retrieved Context:
                            </p>
                            {msg.sources.map((src, sIdx) => (
                              <p key={sIdx} className="text-[10px] text-text-tertiary line-clamp-2 italic" title={src}>
                                • "{src}"
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {chatLoading && (
                    <div className="flex items-start self-start">
                      <div className="bg-surface-alt border border-border-subtle p-3 rounded-lg rounded-bl-none flex items-center gap-1">
                        <span className="w-2 h-2 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Q&A Input Box */}
                <form onSubmit={handleSendQuestion} className="p-4 border-t border-border bg-surface flex gap-3 flex-shrink-0">
                  <input
                    type="text"
                    placeholder="Ask a question about this document..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={chatLoading}
                    className="flex-1 bg-input border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent text-text-primary placeholder:text-text-tertiary/60 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={chatLoading || !chatInput.trim()}
                    className="bg-control text-text-primary border border-border hover:bg-black/40 p-2.5 rounded-lg flex items-center justify-center transition-all focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </form>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default NoteReader;
