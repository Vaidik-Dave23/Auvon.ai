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
    const [notes, setNotes] = useState([]);
    const [myNotes, setMyNotes] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchMyNotes();
    }, []);

    const fetchMyNotes = async () => {
        try {
            const res = await getMyNotes();
            // Sort by creation date - newest first
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

    const handleSearch = async () => {
        if (!query.trim()) return;

        setLoading(true);

        try {
            const res = await searchNotes(query);

            if (res.data.length > 0) {
                // If found existing note
                navigate(`/note/${res.data[0].id}`, { state: res.data[0] });
            } else {
                const gen = await generateNotes(query);
                navigate(`/note/${gen.data.note.id}`, { state: gen.data.note });
            }
        } catch (err) {
            console.error(err);
        }

        setLoading(false);
    };

    const handleFile = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);

        try {
            const res = await uploadPDF(file);
            navigate(`/note/${res.data.note.id}`, { state: res.data.note });
        } catch (err) {
            console.error(err);
        }

        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-base p-6 flex gap-6">
            <Sidebar />

            <div className="flex-1 animate-fade-in flex flex-col">
                {/* PAGE TITLE */}
                <header className="mb-8">
                    <h1 className="text-4xl font-bold text-textMain tracking-tight mb-2">Study Notes</h1>
                    <p className="text-textMuted">Generate AI-powered study notes and manage your learning materials in one place.</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-8 flex-1">

                    {/* LEFT SIDE - MY NOTES */}
                    <div className="md:col-span-5 flex flex-col gap-4">
                        <h2 className="text-xl font-bold text-textMain flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                            Your Library
                        </h2>

                        <div className="space-y-4 overflow-y-auto pr-2 max-h-[70vh]">
                            {myNotes.map((note) => (
                                <div
                                    key={note.id}
                                    onClick={() => navigate(`/note/${note.id}`, { state: note })}
                                    className="glass-panel p-5 rounded-2xl cursor-pointer group hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)] transition-all duration-300 relative border-white/5 hover:border-accent/30 overflow-hidden"
                                >
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-accent to-accentHover opacity-50 group-hover:opacity-100 transition-opacity" />
                                    <p className="font-bold text-lg text-textMain truncate group-hover:text-accent transition-colors">
                                        {note.title}
                                    </p>
                                    <p className="text-xs text-textMuted mt-2 uppercase font-semibold">Click to read</p>
                                </div>
                            ))}
                        </div>

                        {myNotes.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-10 opacity-50">
                                <p className="text-sm text-textMuted italic">No notes yet.</p>
                            </div>
                        )}
                    </div>

                    {/* RIGHT SIDE - GENERATOR */}
                    <div className="md:col-span-7">
                        <div className="glass-panel rounded-3xl p-8 relative overflow-hidden border-accent/20 h-fit">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent to-accentHover" />
                            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl -z-10 pointer-events-none" />

                            <h3 className="text-2xl font-bold mb-6 text-textMain flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                </svg>
                                Generate Study Notes
                            </h3>

                            <div className="flex flex-col gap-6 mb-8">
                                <div className="flex flex-col gap-2">
                                    <label className="font-medium text-sm text-textMuted uppercase tracking-wider">Topic</label>
                                    <input
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                        placeholder="Enter a subject or topic..."
                                        className="w-full p-4 border border-white/5 rounded-xl focus:border-accent/50 outline-none bg-cardHover text-textMain placeholder:text-textMuted/50 transition-colors"
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="font-medium text-sm text-textMuted uppercase tracking-wider">Or Upload Content (PDF)</label>
                                    <div className="relative group">
                                        <input
                                            type="file"
                                            onChange={handleFile}
                                            disabled={loading}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            title="Upload PDF"
                                        />
                                        <div className={`w-full p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 transition-colors ${loading ? "border-white/5 bg-card/50 text-textMuted" : "border-white/10 group-hover:border-accent/50 bg-cardHover text-textMain"
                                            }`}>
                                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-8 w-8 ${loading ? 'text-textMuted' : 'text-textMuted group-hover:text-accent'} transition-colors`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                            </svg>
                                            <span className="font-medium text-textMain">Click to select or drag and drop</span>
                                            <span className="text-xs text-textMuted">PDF files supported</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleSearch}
                                disabled={loading || !query.trim()}
                                className={`w-full py-4 rounded-xl font-bold text-lg text-white transition-all duration-300 flex justify-center items-center gap-3 ${loading || !query.trim()
                                    ? 'bg-cardHover text-textMuted cursor-not-allowed border border-white/5'
                                    : 'bg-gradient-to-r from-accent to-accentHover shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:scale-[1.02] active:scale-95'
                                    }`}
                            >
                                {loading ? (
                                    <>
                                        <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                        </svg>
                                        Generate Note
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Notes;