import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    searchNotes,
    generateNotes,
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
                    setStatusText("Writing detailed study notes...");
                    const gen = await generateNotes(activeQuery);
                    navigate(`/note/${gen.data.note.id}`, { state: gen.data.note });
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

    // Drag-and-drop handlers
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
            // Flash error border effect
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
        <div className="min-h-screen bg-page flex text-text-primary font-sans">
            <Sidebar />

            {/* MAIN CONTENT */}
            <div className="flex-1 h-screen overflow-y-auto p-8 flex flex-col gap-8 animate-fade-in">
                {/* PAGE TITLE */}
                <header className="flex flex-col gap-1">
                    <h1 className="font-serif text-3xl font-semibold text-text-primary">
                        Notes
                    </h1>
                    <p className="text-text-secondary text-sm">
                        Generate a structured note from a topic, or upload a PDF to summarize.
                    </p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* LEFT SIDE - NOTES LIBRARY */}
                    <div className="lg:col-span-7 flex flex-col gap-4">
                        <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                            Library — {myNotes.length}
                        </span>

                        <div className="border border-border rounded-xl bg-surface divide-y divide-border overflow-hidden">
                            {myNotes.map((note) => (
                                <div
                                    key={note.id}
                                    onClick={() => navigate(`/note/${note.id}`, { state: note })}
                                    className="p-5 flex items-center justify-between cursor-pointer hover:bg-surface-alt transition-colors group"
                                >
                                    <div className="flex flex-col gap-1 overflow-hidden">
                                        <p className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors truncate">
                                            {note.title}
                                        </p>
                                        <p className="text-xs text-text-tertiary">
                                            {note.source === "pdf" ? "From PDF" : "Generated"} • {getSectionCount(note.content)} sections
                                        </p>
                                    </div>
                                    <svg
                                        className="h-4 w-4 text-text-tertiary group-hover:text-accent transition-colors flex-shrink-0"
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </div>
                            ))}

                            {myNotes.length === 0 && (
                                <div className="text-center py-16 px-4">
                                    <p className="text-sm text-text-tertiary">
                                        No notes yet. Generate your first one on the right.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT SIDE - GENERATOR PANEL */}
                    <div className="lg:col-span-5">
                        <div className="bg-surface-alt border border-border rounded-xl p-6 flex flex-col gap-6">
                            <h2 className="font-serif text-xl font-medium text-text-primary">
                                New note
                            </h2>

                            <div className="flex flex-col gap-5">
                                {/* Topic Input */}
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                                        Topic
                                    </label>
                                    <input
                                        value={query}
                                        onChange={(e) => {
                                            setQuery(e.target.value);
                                            if (genError) setGenError("");
                                        }}
                                        disabled={loading}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                        placeholder="e.g. Cell respiration"
                                        className="w-full bg-input border border-border text-text-primary placeholder:text-text-tertiary/60 px-4 py-2.5 rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-sm font-sans"
                                    />
                                </div>

                                {/* Divider */}
                                <div className="text-center text-xs text-text-tertiary font-semibold uppercase tracking-wider py-1 font-sans">
                                    or
                                </div>

                                {/* PDF Dropzone */}
                                <div className="flex flex-col gap-2">
                                    <div
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onDrop={handleDrop}
                                        className={`w-full p-6 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                                            dragOver
                                                ? "border-accent bg-surface"
                                                : fileError
                                                ? "border-danger bg-danger/5"
                                                : "border-border hover:border-text-tertiary bg-input"
                                        }`}
                                    >
                                        <input
                                            type="file"
                                            accept="application/pdf"
                                            onChange={(e) => validateAndSetFile(e.target.files[0])}
                                            disabled={loading}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 hidden"
                                            id="pdf-file-input"
                                        />
                                        <label htmlFor="pdf-file-input" className="flex flex-col items-center justify-center cursor-pointer w-full">
                                            <svg
                                                className={`h-6 w-6 mb-2 ${dragOver ? "text-accent" : fileError ? "text-danger" : "text-text-tertiary"}`}
                                                xmlns="http://www.w3.org/2000/svg"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                            </svg>

                                            {file ? (
                                                <div className="flex items-center gap-2 max-w-full text-center">
                                                    <span className="text-sm font-semibold text-text-primary truncate max-w-[200px]" title={file.name}>
                                                        {file.name}
                                                    </span>
                                                    <button
                                                        onClick={removeFile}
                                                        className="text-text-tertiary hover:text-danger font-bold text-lg leading-none p-1 focus:outline-none"
                                                        title="Remove file"
                                                    >
                                                        &times;
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="text-sm font-semibold text-text-primary text-center">
                                                        Drop a PDF here
                                                    </span>
                                                    <span className="text-xs text-text-tertiary text-center">
                                                        or click to browse
                                                    </span>
                                                </>
                                            )}
                                        </label>
                                    </div>

                                    {fileError && (
                                        <p className="text-xs text-danger font-medium mt-1 animate-fade-in">
                                            {fileError}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {genError && (
                                <div className="text-sm text-danger font-medium flex flex-col gap-2 p-3 bg-danger/10 border border-danger/20 rounded-lg animate-fade-in">
                                    <p>{genError}</p>
                                    <button
                                        onClick={handleSearch}
                                        className="text-accent hover:underline text-xs font-bold text-left focus:outline-none"
                                    >
                                        Try again
                                    </button>
                                </div>
                            )}

                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={handleSearch}
                                    disabled={loading || (!query.trim() && !file)}
                                    className={`w-full bg-control hover:bg-black text-text-primary border border-border py-3 rounded-lg font-sans font-semibold text-sm transition-all focus:outline-none focus:ring-1 focus:ring-accent ${
                                        loading || (!query.trim() && !file) ? "opacity-50 cursor-not-allowed" : ""
                                    }`}
                                >
                                    {loading ? "Generating..." : "Generate note"}
                                </button>

                                {loading && statusText && (
                                    <p className="text-xs text-text-tertiary text-center animate-pulse mt-2 font-medium">
                                        {statusText}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Notes;