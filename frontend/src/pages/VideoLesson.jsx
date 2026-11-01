import { useState, useEffect } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import api from "../api/axios";
import {
  isValidYouTubeId,
  extractYouTubeId,
  getYouTubeEmbedUrl,
  getYouTubeWatchUrl,
} from "../utils/youtube";

function VideoLesson() {
  const { videoId: paramVideoId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const cleanVideoId = extractYouTubeId(paramVideoId);
  const isValidId = isValidYouTubeId(cleanVideoId);

  // Initial state from navigation state if available
  const stateData = location.state || {};
  const [video, setVideo] = useState(stateData.video || null);
  const [taskText, setTaskText] = useState(stateData.taskText || "");
  const [goalTitle, setGoalTitle] = useState(stateData.goalTitle || "");
  const [stepId, setStepId] = useState(stateData.stepId || null);
  const [goalId, setGoalId] = useState(stateData.goalId || null);
  const [taskCompleted, setTaskCompleted] = useState(false);
  const [loading, setLoading] = useState(!stateData.video && isValidId);
  const [error, setError] = useState(isValidId ? "" : "Invalid YouTube video ID format.");
  const [playbackWarning, setPlaybackWarning] = useState(false);
  const [copied, setCopied] = useState(false);

  // AI Notes & Quiz States
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [generatedNote, setGeneratedNote] = useState(null);
  const [generatedQuiz, setGeneratedQuiz] = useState(null);
  const [actionError, setActionError] = useState("");

  // Manual Transcript Input Modal (when YouTube captions are unavailable)
  const [showManualModal, setShowManualModal] = useState(false);
  const [modalMode, setModalMode] = useState("notes"); // 'notes' | 'quiz'
  const [modalReason, setModalReason] = useState("");
  const [customTranscript, setCustomTranscript] = useState("");
  const [quizDifficulty, setQuizDifficulty] = useState("easy");
  const [quizQuestionsCount, setQuizQuestionsCount] = useState(5);

  // Fetch video details from backend if not passed in navigation state
  useEffect(() => {
    if (!isValidId) {
      setError("The requested video link is invalid or malformed.");
      return;
    }

    if (!video) {
      const fetchVideoData = async () => {
        try {
          setLoading(true);
          const queryParams = stepId ? `?step_id=${stepId}` : "";
          const res = await api.get(`/videos/${cleanVideoId}${queryParams}`);
          
          setVideo(res.data);
          if (res.data.task) {
            setTaskText(res.data.task.text);
            setTaskCompleted(Boolean(res.data.task.done));
            setStepId(res.data.task.step_id);
          }
          if (res.data.goal) {
            setGoalTitle(res.data.goal.title);
            setGoalId(res.data.goal.goal_id);
          }
          if (res.data.restricted || res.data.embeddable === false) {
            setPlaybackWarning(true);
          }
        } catch (err) {
          console.error("Failed to fetch video details:", err);
          // Fallback to basic video details using videoId
          setVideo({
            id: cleanVideoId,
            video_id: cleanVideoId,
            title: `YouTube Lesson: ${cleanVideoId}`,
            url: getYouTubeWatchUrl(cleanVideoId),
            embed_url: getYouTubeEmbedUrl(cleanVideoId),
            type: "video",
            verified: true,
          });
        } finally {
          setLoading(false);
        }
      };

      fetchVideoData();
    }
  }, [cleanVideoId, isValidId, video, stepId]);

  // Handle task completion toggle directly from lesson page
  const handleToggleStep = async () => {
    if (!stepId) return;
    const previousState = taskCompleted;
    setTaskCompleted(!previousState);

    try {
      await api.put(`/steps/${stepId}`);
    } catch (err) {
      console.error("Failed to toggle step completion:", err);
      setTaskCompleted(previousState);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate Notes from video content
  const handleGenerateNotes = async (manualText = null) => {
    setActionError("");
    setGeneratingNotes(true);

    try {
      const payload = {
        title: video?.title,
        custom_transcript: manualText || customTranscript || null,
        step_id: stepId,
        goal_id: goalId,
      };

      const res = await api.post(`/videos/${cleanVideoId}/notes`, payload);
      setGeneratedNote(res.data.note);
      setShowManualModal(false);
      setCustomTranscript("");
      setModalReason("");
    } catch (err) {
      console.error("Failed to generate notes:", err);
      const detail = err.response?.data?.detail || "";
      if (err.response?.status === 422) {
        setModalMode("notes");
        setModalReason(detail);
        setShowManualModal(true);
        setActionError(detail);
      } else if (err.response?.status === 409) {
        setActionError("A notes generation request for this video is already processing. Please wait.");
      } else {
        setActionError(detail || "Failed to generate notes. Please try again.");
      }
    } finally {
      setGeneratingNotes(false);
    }
  };

  // Generate Quiz from video content
  const handleGenerateQuiz = async (manualText = null) => {
    setActionError("");
    setGeneratingQuiz(true);

    try {
      const payload = {
        num_questions: quizQuestionsCount,
        difficulty: quizDifficulty,
        custom_transcript: manualText || customTranscript || null,
        step_id: stepId,
      };

      const res = await api.post(`/videos/${cleanVideoId}/quiz`, payload);
      setGeneratedQuiz(res.data);
      setShowManualModal(false);
      setCustomTranscript("");
      setModalReason("");
    } catch (err) {
      console.error("Failed to generate quiz:", err);
      const detail = err.response?.data?.detail || "";
      if (err.response?.status === 422) {
        setModalMode("quiz");
        setModalReason(detail);
        setShowManualModal(true);
        setActionError(detail);
      } else if (err.response?.status === 409) {
        setActionError("A quiz generation request for this video is already processing. Please wait.");
      } else {
        setActionError(detail || "Failed to generate quiz. Please try again.");
      }
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const embedUrl = isValidId ? getYouTubeEmbedUrl(cleanVideoId) : null;
  const watchUrl = isValidId ? getYouTubeWatchUrl(cleanVideoId) : null;

  return (
    <div className="min-h-screen bg-page flex text-text-primary font-sans">
      <Sidebar />

      {/* MAIN LESSON CONTAINER */}
      <div className="flex-1 h-screen overflow-y-auto p-4 md:py-6 md:px-8 flex flex-col gap-5 animate-fade-in">
        <div className="w-full flex flex-col gap-5">
        
          {/* TOP NAVIGATION BAR */}
          <div className="w-full flex items-center justify-between gap-4 pb-2 border-b border-border-subtle/40">
            <button
              onClick={() => {
                if (goalId) {
                  navigate(`/goals/${goalId}`);
                } else {
                  navigate("/goals");
                }
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-accent transition-all text-xs font-semibold cursor-pointer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              <span>{goalId ? "Back to Learning Workspace" : "Back to Goals"}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyLink}
                className="px-3.5 py-1.5 rounded-lg bg-surface border border-border text-text-secondary hover:text-text-primary text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                title="Copy Lesson Link"
              >
                {copied ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-success" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-success">Copied!</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.849a2.25 2.25 0 012.013 1.244l.256.512a2.25 2.25 0 002.013 1.244H21a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25H3a2.25 2.25 0 01-2.25-2.25v-9A2.25 2.25 0 013 6.849h.066c.884 0 1.666-.514 2.013-1.244l.256-.512A2.25 2.25 0 017.348 3.85h8.318z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                    </svg>
                    <span>Share</span>
                  </>
                )}
              </button>

              {watchUrl && (
                <a
                  href={watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 rounded-lg bg-surface hover:bg-surface-alt border border-border text-text-secondary hover:text-text-primary text-xs font-semibold transition-all flex items-center gap-1.5"
                >
                  <span>Open in YouTube</span>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              )}
            </div>
          </div>

        {/* ERROR STATE */}
        {error && (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-6 text-center flex flex-col items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-danger">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <h3 className="font-serif text-lg font-semibold text-danger">Video Unavailable</h3>
            <p className="text-text-secondary text-sm max-w-md">{error}</p>
            <button
              onClick={() => navigate("/goals")}
              className="mt-2 px-4 py-2 rounded-lg bg-surface border border-border text-sm font-semibold hover:border-accent transition-all cursor-pointer"
            >
              Return to Roadmap
            </button>
          </div>
        )}

        {/* LOADING SKELETON */}
        {loading && (
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 xl:col-span-8 aspect-video rounded-2xl bg-surface-alt border border-border animate-pulse" />
            <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4">
              <div className="h-28 rounded-xl bg-surface border border-border animate-pulse" />
              <div className="h-48 rounded-xl bg-surface border border-border animate-pulse" />
            </div>
          </div>
        )}

        {/* 2-COLUMN MAIN CONTENT: VIDEO ON LEFT, EVERYTHING ELSE ON RIGHT */}
        {!error && !loading && (
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* LEFT COLUMN: EMBEDDED YOUTUBE PLAYER & PLAYBACK WARNING */}
            <div className="lg:col-span-7 xl:col-span-7 2xl:col-span-8 flex flex-col gap-4 lg:sticky lg:top-4">
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-border shadow-2xl">
                {embedUrl ? (
                  <iframe
                    src={embedUrl}
                    title={video?.title || "Educational Video Lesson"}
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-surface-alt">
                    <p className="text-sm text-text-secondary mb-3">Unable to embed video directly.</p>
                    {watchUrl && (
                      <a
                        href={watchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 rounded-lg bg-accent text-white font-semibold text-sm hover:opacity-90 transition-all"
                      >
                        Watch on YouTube
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* PLAYBACK RESTRICTION ALERT (IF APPLICABLE) */}
              {playbackWarning && (
                <div className="bg-surface-alt border border-border-default rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5 text-text-secondary">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-accent flex-shrink-0">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <span>
                      If this video does not play due to creator playback restrictions or embedding permissions, you can watch it directly on YouTube.
                    </span>
                  </div>
                  {watchUrl && (
                    <a
                      href={watchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 font-semibold text-accent hover:underline"
                    >
                      Watch on YouTube →
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: AI TOOLS & LESSON DETAILS */}
            <div className="lg:col-span-5 xl:col-span-5 2xl:col-span-4 flex flex-col gap-4">

              {/* AI ACTION TOOLBAR: GENERATE NOTES & GENERATE QUIZ */}
              <div className="bg-surface border border-border p-4 rounded-xl flex flex-col gap-3.5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-accent">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                    </svg>
                    <span>AI Learning Tools</span>
                  </div>

                  {stepId && (
                    <button
                      onClick={handleToggleStep}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-sans font-semibold text-xs transition-all cursor-pointer ${
                        taskCompleted
                          ? "bg-success/15 border-success/40 text-success"
                          : "bg-surface-alt border-border text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      <span>{taskCompleted ? "✓ Completed" : "Mark Task Done"}</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {/* GENERATE NOTES BUTTON */}
                  <button
                    onClick={() => handleGenerateNotes()}
                    disabled={generatingNotes || generatingQuiz}
                    className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg bg-accent text-white text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm cursor-pointer"
                  >
                    {generatingNotes ? (
                      <>
                        <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <span>Analyzing & Generating Notes...</span>
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                        </svg>
                        <span>Generate Notes</span>
                      </>
                    )}
                  </button>

                  {/* GENERATE QUIZ BUTTON */}
                  <button
                    onClick={() => handleGenerateQuiz()}
                    disabled={generatingNotes || generatingQuiz}
                    className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg bg-control hover:bg-surface-alt border border-border text-text-primary text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {generatingQuiz ? (
                      <>
                        <svg className="animate-spin h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <span>Analyzing & Generating Quiz...</span>
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-accent">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                        </svg>
                        <span>Generate Quiz</span>
                      </>
                    )}
                  </button>
                </div>

                {actionError && (
                  <p className="text-xs text-danger mt-1">{actionError}</p>
                )}
              </div>

              {/* GENERATED NOTES NOTIFICATION BANNER */}
              {generatedNote && (
                <div className="bg-surface border border-accent/60 p-4 rounded-xl flex items-center justify-between gap-3 animate-fade-in shadow-md">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-accent/20 text-accent flex items-center justify-center flex-shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-serif text-xs md:text-sm font-semibold text-text-primary truncate">
                        Study Notes Created!
                      </h4>
                      <p className="text-[11px] text-text-secondary truncate">
                        Saved to your library.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => navigate(`/note/${generatedNote.id}`)}
                    className="px-3.5 py-1.5 rounded-lg bg-accent text-white font-semibold text-xs hover:opacity-90 transition-all flex items-center gap-1 shadow-sm flex-shrink-0 cursor-pointer"
                  >
                    <span>Open</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </button>
                </div>
              )}

              {/* GENERATED QUIZ NOTIFICATION BANNER */}
              {generatedQuiz && (
                <div className="bg-surface border border-success/40 p-4 rounded-xl flex items-center justify-between gap-3 animate-fade-in shadow-md">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-success/20 text-success flex items-center justify-center flex-shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-serif text-xs md:text-sm font-semibold text-text-primary truncate">
                        Video Quiz Generated
                      </h4>
                      <p className="text-[11px] text-text-secondary truncate">
                        {generatedQuiz.questions?.length || 5} questions ready.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => navigate(`/test/${generatedQuiz.test_id}`)}
                    className="px-3.5 py-1.5 rounded-lg bg-success text-black font-semibold text-xs hover:opacity-90 transition-all flex items-center gap-1 shadow-sm flex-shrink-0 cursor-pointer"
                  >
                    <span>Take Quiz</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </button>
                </div>
              )}

              {/* VIDEO METADATA & ASSOCIATED TASK INFO */}
              <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-4">
                
                {/* HEADER ROW */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-accent/15 text-accent border border-accent/20">
                      In-App Video Lesson
                    </span>
                    {(video?.channel_title || video?.author_name) && (
                      <span className="text-xs text-text-tertiary">
                        by {video.channel_title || video.author_name}
                      </span>
                    )}
                  </div>

                  <h1 className="font-serif text-xl md:text-2xl font-semibold text-text-primary leading-snug">
                    {video?.title || "Video Lesson"}
                  </h1>
                </div>

                {/* ASSOCIATED ROADMAP TASK CONTEXT */}
                {(taskText || goalTitle) && (
                  <div className="p-3.5 rounded-xl bg-surface-alt border border-border-subtle flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                        Associated Roadmap Task
                      </span>
                      {goalTitle && (
                        <span className="text-[11px] text-accent font-medium truncate max-w-[200px]">
                          {goalTitle}
                        </span>
                      )}
                    </div>
                    <p className="text-xs md:text-sm text-text-secondary leading-relaxed">
                      {taskText}
                    </p>
                  </div>
                )}

                {/* VIDEO DESCRIPTION IF AVAILABLE */}
                {video?.description && (
                  <div className="text-xs text-text-tertiary leading-relaxed border-t border-border-subtle pt-3 max-h-52 overflow-y-auto">
                    <p className="font-semibold text-text-secondary mb-1">About this lesson:</p>
                    <p className="whitespace-pre-line">{video.description}</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        </div>

        {/* MANUAL TRANSCRIPT / CONTENT MODAL (WHEN CAPTIONS UNAVAILABLE) */}
        {showManualModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-surface border border-border rounded-2xl max-w-lg w-full p-6 flex flex-col gap-4 shadow-2xl text-left">
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-lg font-medium text-text-primary">
                  {modalMode === "notes" ? "Provide Video Content for Notes" : "Provide Video Content for Quiz"}
                </h3>
                <button
                  onClick={() => setShowManualModal(false)}
                  className="text-text-tertiary hover:text-text-primary p-1"
                >
                  ✕
                </button>
              </div>

              <div className="bg-surface-alt p-3.5 rounded-lg border border-border text-xs text-text-secondary leading-relaxed">
                <p className="font-medium text-text-primary mb-1">
                  Why is manual input needed?
                </p>
                <p>{modalReason || "Direct video understanding and automatic captions were unavailable for this video."}</p>
                <p className="mt-1.5 text-text-tertiary">
                  Paste a transcript, video description, or your own study notes below to generate grounded study materials:
                </p>
              </div>

              <textarea
                value={customTranscript}
                onChange={(e) => setCustomTranscript(e.target.value)}
                placeholder="Paste video transcript, lecture notes, or key topic points here..."
                rows={6}
                className="w-full p-3 rounded-lg bg-input border border-border text-text-primary text-xs font-sans placeholder:text-text-tertiary/60 focus:outline-none focus:border-accent"
              />

              {modalMode === "quiz" && (
                <div className="flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-text-tertiary">Difficulty:</span>
                    <select
                      value={quizDifficulty}
                      onChange={(e) => setQuizDifficulty(e.target.value)}
                      className="bg-input border border-border rounded px-2 py-1 text-text-primary font-medium"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-text-tertiary">Questions:</span>
                    <select
                      value={quizQuestionsCount}
                      onChange={(e) => setQuizQuestionsCount(parseInt(e.target.value))}
                      className="bg-input border border-border rounded px-2 py-1 text-text-primary font-medium"
                    >
                      <option value={3}>3</option>
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 rounded-lg bg-control border border-border text-xs font-semibold hover:bg-surface-alt text-text-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (modalMode === "notes") {
                      handleGenerateNotes(customTranscript);
                    } else {
                      handleGenerateQuiz(customTranscript);
                    }
                  }}
                  disabled={!customTranscript.trim() || generatingNotes || generatingQuiz}
                  className="px-5 py-2 rounded-lg bg-accent text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {generatingNotes || generatingQuiz ? "Generating..." : `Generate ${modalMode === "notes" ? "Notes" : "Quiz"}`}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default VideoLesson;
