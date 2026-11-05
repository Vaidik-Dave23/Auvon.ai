import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import api from "../api/axios";
import { postStream, throttled } from "../api/stream";

export default function TutorPanel({
  noteId,
  testId,
  goalId,
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
  initialMessage = "",
}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [streamStarted, setStreamStarted] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = controlledOnClose
    ? (val) => {
        if (!val) controlledOnClose();
      }
    : setInternalIsOpen;

  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [remainingToday, setRemainingToday] = useState(50);
  const [showSessionsList, setShowSessionsList] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Scroll messages to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load sessions on mount or when opened
  useEffect(() => {
    if (isOpen) {
      fetchSessions();
      if (initialMessage && !loading) {
        setInput(initialMessage);
        // Focus input
        setTimeout(() => {
          inputRef.current?.focus();
        }, 150);
      }
    }
  }, [isOpen, initialMessage]);

  const fetchSessions = async () => {
    try {
      const res = await api.get("/tutor/sessions");
      setSessions(res.data || []);
      if (!currentSessionId && res.data && res.data.length > 0) {
        // Optionally load the most recent session
        loadSession(res.data[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch tutor sessions:", err);
    }
  };

  const loadSession = async (sessionId) => {
    try {
      setLoading(true);
      setShowSessionsList(false);
      setErrorMessage("");
      const res = await api.get(`/tutor/sessions/${sessionId}`);
      setCurrentSessionId(sessionId);
      setMessages(res.data.messages || []);
    } catch (err) {
      console.error("Failed to load session:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartNewSession = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setShowSessionsList(false);
    setErrorMessage("");
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const handleDeleteSession = async (e, sessionId) => {
    e.stopPropagation();
    try {
      await api.delete(`/tutor/sessions/${sessionId}`);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        handleStartNewSession();
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    if (trimmed.length > 2000) {
      setErrorMessage("Message exceeds 2,000 characters limit.");
      return;
    }

    setErrorMessage("");
    const userMsg = {
      role: "user",
      content: trimmed,
      sources: [],
      ts: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const payload = {
      message: trimmed,
      session_id: currentSessionId || undefined,
      note_id: noteId ? String(noteId) : undefined,
      test_id: testId ? String(testId) : undefined,
      goal_id: goalId ? String(goalId) : undefined,
    };

    const applyMeta = (data) => {
      if (!currentSessionId && data.session_id) {
        setCurrentSessionId(data.session_id);
        fetchSessions();
      }
      setRemainingToday(data.remaining_today !== undefined ? data.remaining_today : 50);
    };
    const showError = (err) => {
      const status = err.status || err.response?.status;
      const detail = err.detail || err.response?.data?.detail;
      setErrorMessage(
        status === 429
          ? detail || "Daily tutor message limit reached (50/day). Please try again tomorrow!"
          : detail || "Tutor is temporarily unavailable. Please try again."
      );
    };

    // Stream the reply so it shows up word by word; fall back to the normal endpoint if streaming isn't possible.
    let sources = [];
    let text = "";
    let started = false;
    const render = throttled((t) =>
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], content: t };
        return next;
      })
    );
    try {
      await postStream("/tutor/chat/stream", {
        json: payload,
        onEvent: (evt) => {
          if (evt.type === "meta") {
            applyMeta(evt);
            sources = evt.sources || [];
          } else if (evt.type === "delta") {
            text += evt.text;
            if (!started) {
              started = true;
              setStreamStarted(true);
              setMessages((prev) => [...prev, { role: "assistant", content: text, sources, ts: new Date().toISOString() }]);
            } else {
              render(text);
            }
          } else if (evt.type === "done") {
            render.cancel();
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { ...next[next.length - 1], content: evt.reply || text };
              return next;
            });
          }
        },
      });
    } catch (err) {
      render.cancel();
      if (started) {
        // part of the answer already arrived: keep it and say it was cut short
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { ...next[next.length - 1], content: text };
          return next;
        });
        setErrorMessage("The answer was cut short. Please ask again.");
      } else if (err.status && err.status !== 404 && err.status !== 405) {
        showError(err);
      } else {
        try {
          const res = await api.post("/tutor/chat", payload);
          applyMeta(res.data);
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: res.data.reply, sources: res.data.sources || [], ts: new Date().toISOString() },
          ]);
        } catch (fallbackErr) {
          console.error("Tutor chat failed:", fallbackErr);
          showError(fallbackErr);
        }
      }
    } finally {
      setLoading(false);
      setStreamStarted(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating "Ask tutor" Button (shown when drawer is closed) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-4 py-3 rounded-full shadow-lg border transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer font-medium text-sm"
          style={{
            backgroundColor: "var(--accent-primary)",
            color: "var(--accent-text, #ffffff)",
            borderColor: "var(--accent-border, rgba(0,82,255,0.2))",
            boxShadow: "var(--shadow-btn)",
          }}
          aria-label="Ask AI Tutor"
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
          <span className="font-semibold tracking-wide">Ask Tutor</span>
          {noteId && <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/20">Note</span>}
          {testId && <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/20">Quiz</span>}
          {goalId && <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/20">Goal</span>}
        </button>
      )}

      {/* Slide-over Drawer Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Slide-over Right Panel */}
      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-[440px] z-50 flex flex-col transition-transform duration-300 ease-in-out border-l shadow-2xl ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-primary)",
        }}
      >
        {/* Panel Header */}
        <header
          className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-surface-subtle)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs"
              style={{
                backgroundColor: "var(--accent-soft)",
                color: "var(--accent-primary)",
                border: "1px solid var(--accent-border)",
              }}
            >
              🎓
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold tracking-tight font-heading">Auvon Tutor</h2>
                <span
                  className="text-[10px] font-mono px-1.5 py-0.2 rounded-full font-semibold uppercase tracking-wider"
                  style={{
                    backgroundColor: "var(--accent-soft)",
                    color: "var(--accent-primary)",
                  }}
                >
                  Socratic
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] font-mono">
                {noteId ? "Linked to current note" : testId ? "Reviewing assessment" : goalId ? "Focused on learning goal" : "Grounded in your notes"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Voice lesson (study call) for the current note */}
            {noteId && (
              <button
                onClick={() => navigate(`/note/${noteId}/call`)}
                className="p-1.5 rounded-lg text-xs font-mono border hover:opacity-80 transition cursor-pointer flex items-center gap-1"
                style={{
                  borderColor: "var(--accent-border)",
                  color: "var(--accent-primary)",
                  backgroundColor: "var(--accent-soft)",
                }}
                title="Start a voice lesson on this note"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0M12 17v5" strokeLinecap="round" />
                </svg>
                Voice lesson
              </button>
            )}

            {/* Sessions list toggle button */}
            <button
              onClick={() => setShowSessionsList(!showSessionsList)}
              className="p-1.5 rounded-lg text-xs font-mono border hover:opacity-80 transition cursor-pointer"
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
              title="Recent Conversations"
            >
              💬 History
            </button>

            {/* New chat button */}
            <button
              onClick={handleStartNewSession}
              className="p-1.5 rounded-lg text-xs font-mono border hover:opacity-80 transition cursor-pointer"
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
              title="New Session"
            >
              ＋ New
            </button>

            {/* Close button */}
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
              aria-label="Close tutor panel"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        {/* Sessions Drawer Dropdown */}
        {showSessionsList && (
          <div
            className="border-b p-3 max-h-60 overflow-y-auto divide-y divide-[var(--border-subtle)] flex-shrink-0"
            style={{
              backgroundColor: "var(--bg-surface-subtle)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[11px] font-mono uppercase tracking-wider font-semibold text-[var(--text-secondary)]">
                Recent Sessions
              </span>
              <button
                onClick={handleStartNewSession}
                className="text-[11px] font-semibold text-[var(--accent-primary)] hover:underline cursor-pointer"
              >
                + New Chat
              </button>
            </div>
            {sessions.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] p-2">No prior study sessions yet.</p>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => loadSession(s.id)}
                  className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition text-xs ${
                    s.id === currentSessionId ? "font-semibold bg-white/50" : "hover:bg-white/30"
                  }`}
                >
                  <div className="flex-1 truncate mr-2">
                    <p className="truncate text-[var(--text-primary)]">{s.title || "Study Session"}</p>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">
                      {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : ""}
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteSession(e, s.id)}
                    className="text-[var(--text-muted)] hover:text-red-500 p-1"
                    title="Delete session"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Messages Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !loading && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[var(--text-secondary)]">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-3"
                style={{
                  backgroundColor: "var(--accent-soft)",
                  border: "1px solid var(--accent-border)",
                }}
              >
                💡
              </div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1 font-heading">
                Socratic Study Tutor
              </h3>
              <p className="text-xs max-w-xs leading-relaxed text-[var(--text-secondary)]">
                Ask any question about your notes or concepts you find tricky. I'll guide you with hints and questions so you can master it step by step.
              </p>

              <div className="mt-4 flex flex-col gap-1.5 w-full max-w-xs text-left">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                  Try asking:
                </span>
                <button
                  onClick={() => {
                    setInput("Can you test my understanding of the main concept in my notes?");
                    inputRef.current?.focus();
                  }}
                  className="text-xs p-2 rounded-lg border text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition text-left cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  "Test my understanding of my notes"
                </button>
                <button
                  onClick={() => {
                    setInput("Give me a hint to help me think through my weak areas.");
                    inputRef.current?.focus();
                  }}
                  className="text-xs p-2 rounded-lg border text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition text-left cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  "Give me a hint on my recent weak topics"
                </button>
              </div>
            </div>
          )}

          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
            >
              {/* Message Bubble */}
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "text-white shadow-sm"
                    : "border shadow-xs"
                }`}
                style={
                  m.role === "user"
                    ? {
                        backgroundColor: "var(--accent-primary)",
                      }
                    : {
                        backgroundColor: "var(--bg-surface-subtle)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-primary)",
                      }
                }
              >
                {m.role === "user" ? (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                ) : (
                  <div className="prose prose-sm max-w-none break-words text-[var(--text-primary)]">
                    <ReactMarkdown
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                        ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                        ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
                        code: ({ node, inline, ...props }) =>
                          inline ? (
                            <code
                              className="px-1.5 py-0.5 rounded text-xs font-mono"
                              style={{ backgroundColor: "rgba(0,0,0,0.06)" }}
                              {...props}
                            />
                          ) : (
                            <pre
                              className="p-2.5 rounded-lg text-xs font-mono overflow-x-auto my-2"
                              style={{ backgroundColor: "rgba(0,0,0,0.06)" }}
                            >
                              <code {...props} />
                            </pre>
                          ),
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>

              {/* Source chips */}
              {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2 pl-1 max-w-[88%]">
                  <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                    Sources:
                  </span>
                  {m.sources.map((src, sIdx) => (
                    <button
                      key={sIdx}
                      onClick={() => navigate(`/note/${src.note_id}`)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono border transition hover:opacity-80 cursor-pointer"
                      style={{
                        backgroundColor: "var(--accent-soft)",
                        borderColor: "var(--accent-border)",
                        color: "var(--accent-primary)",
                      }}
                      title={src.snippet ? `Snippet: ${src.snippet}` : src.title}
                    >
                      <span>[{sIdx + 1}]</span>
                      <span className="truncate max-w-[120px]">{src.title || "Note"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Typing Indicator (hidden once the streamed answer starts appearing) */}
          {loading && !streamStarted && (
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs pl-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px]"
                style={{
                  backgroundColor: "var(--accent-soft)",
                  color: "var(--accent-primary)",
                }}
              >
                🎓
              </div>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="text-[11px] font-mono">Thinking Socratically...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error message alert */}
        {errorMessage && (
          <div
            className="px-4 py-2 text-xs font-mono border-t border-b flex items-center justify-between"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.08)",
              borderColor: "rgba(239, 68, 68, 0.2)",
              color: "#EF4444",
            }}
          >
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage("")} className="font-bold cursor-pointer">✕</button>
          </div>
        )}

        {/* Input & Footer */}
        <footer
          className="p-4 border-t flex flex-col gap-2 flex-shrink-0"
          style={{
            borderColor: "var(--border-subtle)",
            backgroundColor: "var(--bg-surface)",
          }}
        >
          <form onSubmit={handleSend} className="relative flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question or request a hint..."
              rows={2}
              maxLength={2000}
              disabled={loading}
              className="w-full resize-none rounded-xl p-3 text-xs focus:outline-none border transition leading-relaxed"
              style={{
                backgroundColor: "var(--bg-surface-subtle)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            />

            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="p-3 rounded-xl flex items-center justify-center transition disabled:opacity-40 cursor-pointer flex-shrink-0"
              style={{
                backgroundColor: "var(--accent-primary)",
                color: "#ffffff",
              }}
              aria-label="Send message"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </button>
          </form>

          {/* Under-input counters */}
          <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)] px-1">
            <span>{remainingToday} messages left today</span>
            <span>{input.length}/2000</span>
          </div>
        </footer>
      </aside>
    </>
  );
}

