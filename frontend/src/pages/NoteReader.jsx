import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import api from "../api/axios";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import VideoCard from "../components/VideoCard";
import { extractYouTubeId } from "../utils/youtube";

const preprocessMarkdown = (content) => {
  if (!content) return "";

  // 1. Replace triple single-quotes with triple backticks for code blocks
  let processed = content.replace(/'''/g, "```");

  // 2. High-performance lookbehind-free isolation pipeline for raw environments
  const environmentRegex = /\\begin\{(array|cases)\}([\s\S]*?)\\end\{\1\}/g;
  processed = processed.replace(environmentRegex, (match, envType, envBody, offset, fullString) => {
    const textBefore = fullString.substring(Math.max(0, offset - 12), offset).trim();
    const textAfter = fullString.substring(offset + match.length, offset + match.length + 12).trim();

    if (textBefore.endsWith("$$") && textAfter.startsWith("$$")) {
      return match;
    }
    return `\n$$\n\\begin{${envType}}${envBody}\\end{${envType}}\n$$\n`;
  });

  // 3. Ultra-fast individual line checks for orphaned items
  const lines = processed.split("\n");
  let insideMathBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("$$")) {
      insideMathBlock = !insideMathBlock;
    }

    if (!insideMathBlock && (line.includes("\\begin{array}") || line.includes("\\begin{cases}")) && !line.startsWith("$$")) {
      lines[i] = `$$\n${lines[i]}`;
      insideMathBlock = true;
    }
    if (insideMathBlock && (line.includes("\\end{array}") || line.includes("\\end{cases}")) && !line.endsWith("$$")) {
      lines[i] = `${lines[i]}\n$$`;
      insideMathBlock = false;
    }
  }
  processed = lines.join("\n");

  // 4. Fix underscores inside \text{...} in LaTeX blocks to prevent KaTeX parse errors
  processed = processed.replace(/\$\$[\s\S]*?\$\$|\$[\s\S]*?\$/g, (mathBlock) => {
    return mathBlock.replace(/\\text\{([^}]*)\}/g, (textMatch, textContent) => {
      if (textContent.includes("_")) {
        return `\\text{${textContent.replace(/_/g, "\\_")}}`;
      }
      return textMatch;
    });
  });

  return processed;
};

function CodeBlock({ className, children, ...props }) {
  const [copied, setCopied] = useState(false);
  const codeContent = String(children).replace(/\n$/, "");
  const match = /language-(\w+)/.exec(className || "");
  const lang = match ? match[1] : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-4 rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] font-mono text-[var(--text-secondary)]">
        <span>{lang || "code"}</span>
        <button
          onClick={handleCopy}
          type="button"
          className="hover:text-[var(--accent-primary)] font-semibold transition-colors focus:outline-none flex items-center gap-1 cursor-pointer"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-xs font-mono text-[var(--text-primary)] leading-relaxed">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

function NoteReader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();

  const [note, setNote] = useState(location.state || null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [loading, setLoading] = useState(!note);
  const [copiedNote, setCopiedNote] = useState(false);

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

  const handleCopyNoteContent = () => {
    if (!note?.content) return;
    navigator.clipboard.writeText(note.content);
    setCopiedNote(true);
    setTimeout(() => setCopiedNote(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col font-sans transition-colors duration-250">
      <Sidebar />

      {/* Main Container with generous width */}
      <main className="w-full max-w-[1560px] mx-auto px-6 md:px-10 pb-20 flex flex-col gap-6 flex-1 animate-fade-in">
        {/* Top Navigation Row */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/notes")}
            className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back to Library
          </button>

          {note && (
            <button
              onClick={handleCopyNoteContent}
              className="auvon-pill-btn-secondary text-xs py-2 px-4 cursor-pointer flex items-center gap-1.5"
            >
              <span>{copiedNote ? "✓ Copied Note" : "Copy Full Note"}</span>
            </button>
          )}
        </div>

        {/* Loading Skeleton */}
        {loading ? (
          <div className="auvon-card flex flex-col gap-4 animate-pulse">
            <div className="h-6 w-1/4 bg-[var(--border-subtle)] rounded-full" />
            <div className="h-10 w-2/3 bg-[var(--border-subtle)] rounded-xl" />
            <div className="h-4 w-full bg-[var(--border-subtle)] rounded mt-4" />
            <div className="h-4 w-5/6 bg-[var(--border-subtle)] rounded" />
            <div className="h-4 w-4/6 bg-[var(--border-subtle)] rounded" />
          </div>
        ) : (
          note && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* LEFT / CENTER: Study Notes Column */}
              <div className="lg:col-span-8 flex flex-col gap-6">
                <div className="auvon-card w-full">
                  {/* Clean Metadata Header (No raw database IDs) */}
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="auvon-telemetry-badge">
                      {note.source === "pdf" ? "PDF Document Note" : "AI Study Note"}
                    </span>
                  </div>

                  <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[var(--text-primary)] font-heading mb-6 leading-snug">
                    {note.title}
                  </h1>

                  <div className="prose max-w-none text-[var(--text-secondary)] text-base leading-relaxed font-sans">
                    <ReactMarkdown
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        h1: ({ children }) => (
                          <h1 className="font-heading text-2xl font-bold mt-8 mb-4 text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2">
                            {children}
                          </h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="font-heading text-xl font-bold mt-6 mb-3 text-[var(--text-primary)]">
                            {children}
                          </h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="font-heading text-lg font-semibold mt-5 mb-2 text-[var(--text-primary)]">
                            {children}
                          </h3>
                        ),
                        p: ({ children }) => <p className="mb-4 text-[var(--text-secondary)]">{children}</p>,
                        li: ({ children }) => <li className="ml-6 mb-2 list-disc text-[var(--text-secondary)]">{children}</li>,
                        ul: ({ children }) => <ul className="mb-4">{children}</ul>,
                        ol: ({ children }) => <ol className="mb-4 list-decimal pl-4">{children}</ol>,
                        blockquote: ({ children }) => (
                          <div className="my-4 p-4 bg-[var(--accent-soft)] border-l-4 border-[var(--accent-primary)] rounded-r-xl text-sm leading-relaxed text-[var(--text-primary)] font-sans">
                            {children}
                          </div>
                        ),
                        code: ({ className, children, ...props }) => {
                          const match = /language-(\w+)/.exec(className || "");
                          if (!match && !String(children).includes("\n")) {
                            return (
                              <code className="bg-[var(--accent-soft)] text-[var(--accent-primary)] px-1.5 py-0.5 rounded text-xs font-mono font-semibold" {...props}>
                                {children}
                              </code>
                            );
                          }
                          return (
                            <CodeBlock className={className} {...props}>
                              {children}
                            </CodeBlock>
                          );
                        },
                        a: ({ href, children, ...props }) => {
                          const vidId = extractYouTubeId(href);
                          if (vidId) {
                            return (
                              <div className="my-4 not-prose">
                                <VideoCard
                                  video={{
                                    id: vidId,
                                    video_id: vidId,
                                    title: typeof children === "string" ? children : `Video Lesson: ${vidId}`,
                                    url: href,
                                    embed_url: `https://www.youtube-nocookie.com/embed/${vidId}`,
                                    type: "video",
                                    verified: true,
                                  }}
                                  compact={true}
                                />
                              </div>
                            );
                          }
                          return (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--accent-primary)] hover:underline font-semibold"
                              {...props}
                            >
                              {children}
                            </a>
                          );
                        },
                      }}
                    >
                      {preprocessMarkdown(note.content)}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>

              {/* RIGHT: Document Q&A Panel */}
              <div className="lg:col-span-4 sticky top-6">
                <div className="auvon-card flex flex-col p-5 gap-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-primary)] animate-pulse" />
                      <h2 className="text-sm font-bold font-heading text-[var(--text-primary)]">
                        Ask Document Q&A
                      </h2>
                    </div>
                  </div>

                  {/* Messages Area */}
                  <div className="flex flex-col gap-3 max-h-[460px] overflow-y-auto pr-1">
                    {chatMessages.length === 0 ? (
                      <div className="py-10 text-center flex flex-col items-center">
                        <div className="w-10 h-10 rounded-full bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center mb-2">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                          </svg>
                        </div>
                        <p className="text-xs font-semibold text-[var(--text-primary)]">
                          Ask questions about this note
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-1 max-w-[220px]">
                          AI scans this document to answer queries with citations.
                        </p>
                      </div>
                    ) : (
                      chatMessages.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} w-full`}
                        >
                          <div
                            className={`p-3 rounded-2xl text-xs leading-relaxed max-w-[90%] ${
                              msg.role === "user"
                                ? "bg-[var(--accent-primary)] text-white rounded-br-none"
                                : "bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-bl-none"
                            }`}
                          >
                            {msg.role === "user" ? (
                              msg.text
                            ) : (
                              <ReactMarkdown
                                remarkPlugins={[remarkMath]}
                                rehypePlugins={[rehypeKatex]}
                                components={{
                                  p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                                  code: ({ children }) => (
                                    <code className="bg-[var(--accent-soft)] text-[var(--accent-primary)] px-1 py-0.5 rounded text-[11px] font-mono">
                                      {children}
                                    </code>
                                  ),
                                }}
                              >
                                {preprocessMarkdown(msg.text)}
                              </ReactMarkdown>
                            )}
                          </div>

                          {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                            <div className="mt-1.5 pl-2.5 border-l-2 border-[var(--accent-primary)] space-y-0.5 max-w-[90%]">
                              <p className="text-[9px] font-mono font-bold text-[var(--text-muted)] uppercase">
                                Cited Source:
                              </p>
                              {msg.sources.map((src, sIdx) => (
                                <p key={sIdx} className="text-[10px] text-[var(--text-secondary)] italic line-clamp-2">
                                  "{src}"
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}

                    {chatLoading && (
                      <div className="flex items-center gap-1.5 self-start p-3 bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] rounded-2xl rounded-bl-none text-xs text-[var(--text-secondary)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-bounce" />
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-bounce [animation-delay:300ms]" />
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Input form */}
                  <form onSubmit={handleSendQuestion} className="flex gap-2 pt-2 border-t border-[var(--border-subtle)]">
                    <input
                      type="text"
                      placeholder="Ask about this note..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={chatLoading}
                      className="flex-1 bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-3.5 py-2.5 rounded-xl text-xs focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-all font-sans"
                    />
                    <button
                      type="submit"
                      disabled={chatLoading || !chatInput.trim()}
                      className="auvon-pill-btn-primary px-3 py-2 text-xs flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )
        )}
      </main>
    </div>
  );
}

export default NoteReader;