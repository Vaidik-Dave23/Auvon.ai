import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  searchNotes,
  getMyNotes,
  uploadPDF,
} from "../api/notes";
import Sidebar from "../components/Sidebar";

function Notes() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [myNotes, setMyNotes] = useState([]);
  const [loading, setLoading] = useState(false);

  // Status text for generation steps
  const [statusText, setStatusText] = useState("");

  // Drag-and-drop & file states
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState("");
  const [genError, setGenError] = useState("");

  useEffect(() => {
    fetchMyNotes();
  }, []);

  const fetchMyNotes = async () => {
    try {
      const res = await getMyNotes();
      const sorted = res.data.sort((a, b) => {
        if (a.created_at && b.created_at) {
          return new Date(b.created_at) - new Date(a.created_at);
        }
        return b.id - a.id;
      });
      setMyNotes(sorted);
    } catch (err) {
      console.error(err);
    }
  };

  // Calculate section counts dynamically by splitting headings
  const getSectionCount = (content) => {
    if (!content) return 4;
    const matches = content.split(/(?:^|\n)##?\s+/);
    return Math.max(3, matches.length - 1);
  };

  const handleSearch = async () => {
    const activeQuery = query.trim();
    if (!activeQuery && !file) return;

    setLoading(true);
    setGenError("");
    setStatusText("Analyzing prompt...");

    try {
      if (file) {
        setStatusText("Reading document...");
        const res = await uploadPDF(file);
        setStatusText("Writing summary...");
        setTimeout(() => {
          navigate(`/note/${res.data.note.id}`, { state: res.data.note });
        }, 1000);
      } else {
        setStatusText("Generating structure...");
        const res = await searchNotes(activeQuery);

        if (res.data.length > 0) {
          setStatusText("Loading existing note...");
          navigate(`/note/${res.data[0].id}`, { state: res.data[0] });
        } else {
          // open the note page right away and let it stream the note in as it is written
          navigate("/note/new", { state: { streamQuery: activeQuery } });
        }
      }
    } catch (err) {
      console.error(err);
      setGenError(err.response?.data?.detail || "Generation failed. Please try again.");
    } finally {
      setLoading(false);
      setStatusText("");
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const validateAndSetFile = (selectedFile) => {
    setFileError("");
    setGenError("");
    if (!selectedFile) return;

    if (selectedFile.type !== "application/pdf") {
      setFileError("Only PDF files are supported");
      setDragOver(false);
      return;
    }

    setFile(selectedFile);
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    validateAndSetFile(droppedFile);
  };

  const removeFile = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setFile(null);
    setFileError("");
  };

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col font-sans transition-colors duration-250">
      <Sidebar />

      {/* Main Container with generous width */}
      <main className="w-full max-w-[1560px] mx-auto px-6 md:px-10 pb-20 flex flex-col gap-8 flex-1 animate-fade-in">
        {/* Page Header */}
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-[var(--text-primary)] font-heading">
            Study Notes
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Generate structured AI study notes from any topic, or upload research PDFs to summarize.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT SIDE - NOTES LIBRARY */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-secondary)] tracking-wider uppercase">
                Your Saved Notes ({myNotes.length})
              </span>
            </div>

            <div className="auvon-card !p-0 divide-y divide-[var(--border-subtle)] overflow-hidden">
              {myNotes.map((note) => (
                <div
                  key={note.id}
                  onClick={() => navigate(`/note/${note.id}`, { state: note })}
                  className="p-5 flex items-center justify-between cursor-pointer hover:bg-[var(--accent-soft)]/40 transition-colors group"
                >
                  <div className="flex flex-col gap-1.5 overflow-hidden pr-4">
                    <p className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-primary)] transition-colors truncate">
                      {note.title}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                        {note.source === "pdf" ? "PDF Source" : "AI Generated"}
                      </span>
                      <span className="text-[11px] font-mono text-[var(--text-muted)]">
                        • {getSectionCount(note.content)} sections
                      </span>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] group-hover:border-[var(--accent-primary)] group-hover:text-[var(--accent-primary)] group-hover:bg-[var(--accent-soft)] transition-all flex-shrink-0">
                    <svg
                      className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              ))}

              {myNotes.length === 0 && (
                <div className="text-center py-16 px-4 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center mb-3">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    No study notes yet
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    Generate your first note from a topic or document using the generator.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT SIDE - GENERATOR PANEL */}
          <div className="lg:col-span-5">
            <div className="auvon-card flex flex-col gap-6">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)] font-heading">
                  Create New Note
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Type a topic or attach a PDF textbook/paper.
                </p>
              </div>

              <div className="flex flex-col gap-5">
                {/* Topic Input */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-mono font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Topic or Key Concept
                  </label>
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      if (genError) setGenError("");
                    }}
                    disabled={loading}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="e.g. Cellular Respiration, Distributed Systems..."
                    className="w-full bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-4 py-3 rounded-xl focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-all text-sm font-sans"
                  />
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-[var(--border-subtle)]" />
                  <span className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-wider">
                    or upload document
                  </span>
                  <div className="flex-1 h-px bg-[var(--border-subtle)]" />
                </div>

                {/* PDF Dropzone */}
                <div className="flex flex-col gap-2">
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`w-full p-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                      dragOver
                        ? "border-[var(--accent-primary)] bg-[var(--accent-soft)]"
                        : fileError
                        ? "border-red-400 bg-red-50"
                        : "border-[var(--border-subtle)] hover:border-[var(--accent-primary)] bg-[var(--bg-surface-subtle)]"
                    }`}
                  >
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => validateAndSetFile(e.target.files[0])}
                      disabled={loading}
                      className="hidden"
                      id="pdf-file-input"
                    />
                    <label htmlFor="pdf-file-input" className="flex flex-col items-center justify-center cursor-pointer w-full">
                      <div className="w-10 h-10 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent-primary)] mb-2 shadow-sm">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                      </div>

                      {file ? (
                        <div className="flex items-center gap-2 max-w-full text-center">
                          <span className="text-xs font-mono font-semibold text-[var(--text-primary)] truncate max-w-[200px]" title={file.name}>
                            {file.name}
                          </span>
                          <button
                            onClick={removeFile}
                            className="text-[var(--text-muted)] hover:text-red-500 font-bold text-base leading-none p-1 focus:outline-none"
                            title="Remove file"
                          >
                            &times;
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-xs font-semibold text-[var(--text-primary)] text-center">
                            Drop a PDF research paper or textbook
                          </span>
                          <span className="text-[11px] font-mono text-[var(--text-muted)] text-center">
                            or click to browse files
                          </span>
                        </>
                      )}
                    </label>
                  </div>

                  {fileError && (
                    <p className="text-xs text-red-500 font-mono mt-1">
                      {fileError}
                    </p>
                  )}
                </div>
              </div>

              {genError && (
                <div className="text-xs text-red-600 p-3 bg-red-50 border border-red-200 rounded-xl flex flex-col gap-1.5 font-sans">
                  <p className="font-medium">{genError}</p>
                  <button
                    onClick={handleSearch}
                    className="text-[var(--accent-primary)] hover:underline text-xs font-semibold text-left focus:outline-none"
                  >
                    Try again
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <button
                  onClick={handleSearch}
                  disabled={loading || (!query.trim() && !file)}
                  className="auvon-pill-btn-primary w-full py-3 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>Generating Notes...</span>
                    </>
                  ) : (
                    <span>✦ Generate Notes</span>
                  )}
                </button>

                {loading && statusText && (
                  <p className="text-xs font-mono text-[var(--text-secondary)] text-center animate-pulse mt-1">
                    {statusText}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Notes;