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
    <div className="min-h-screen flex flex-col bg-canvas text-[var(--text-primary)] font-sans antialiased">
      {/* FLOATING TOP NAVIGATION DOCK */}
      <Sidebar />

      {/* MAIN LESSON CONTAINER with generous width */}
      <main className="w-full max-w-[1560px] mx-auto px-6 md:px-10 pb-20 flex flex-col gap-6 flex-1 animate-fade-in">
        {/* TOP NAVIGATION BAR / BREADCRUMB */}
        <div className="w-full flex items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => {
              if (goalId) {
                navigate(`/goals/${goalId}`);
              } else {
                navigate("/goals");
              }
            }}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-all text-xs font-medium cursor-pointer shadow-xs"
          >
            <span>←</span>
            <span>{goalId ? "Back to Learning Workspace" : "Back to Goals"}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyLink}
              className="px-3.5 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Copy Lesson Link"
            >
              {copied ? (
                <span className="text-emerald-600 font-semibold">✓ Copied!</span>
              ) : (
                <span>Share Lesson</span>
              )}
            </button>

            {watchUrl && (
              <a
                href={watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-medium transition-all flex items-center gap-1.5 shadow-xs"
              >
                <span>YouTube ↗</span>
              </a>
            )}
          </div>
        </div>

        {/* ERROR STATE */}
        {error && (
          <div className="auvon-card text-center flex flex-col items-center gap-3">
            <h3 className="font-heading text-lg font-bold text-red-500">Video Unavailable</h3>
            <p className="text-[var(--text-secondary)] text-sm max-w-md">{error}</p>
            <button
              type="button"
              onClick={() => navigate("/goals")}
              className="auvon-pill-btn-secondary text-xs py-2 px-4 cursor-pointer"
            >
              Return to Roadmap
            </button>
          </div>
        )}

        {/* LOADING SKELETON */}
        {loading && (
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-7 xl:col-span-8 aspect-video rounded-[18px] bg-[var(--bg-surface)] border border-[var(--border-card)] animate-pulse" />
            <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4">
              <div className="h-32 rounded-[var(--radius-card)] bg-[var(--bg-surface)] border border-[var(--border-card)] animate-pulse" />
              <div className="h-48 rounded-[var(--radius-card)] bg-[var(--bg-surface)] border border-[var(--border-card)] animate-pulse" />
            </div>
          </div>
        )}

        {/* 2-COLUMN ASYMMETRIC MAIN CONTENT (SECTION 4-C-2 SPECIFICATION) */}
        {!error && !loading && (
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* LEFT COLUMN: 1.6fr VIDEO STAGE & LESSON DETAILS */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-5 lg:sticky lg:top-4">
              {/* VIDEO FRAME: BORDER-RADIUS 18PX, OVERFLOW HIDDEN, SHADOW-CARD */}
              <div
                className="relative w-full aspect-video rounded-[18px] overflow-hidden bg-black border border-[var(--border-card)]"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
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
                  <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-[var(--bg-surface-subtle)]">
                    <p className="text-sm text-[var(--text-secondary)] mb-3">Unable to embed video directly.</p>
                    {watchUrl && (
                      <a
                        href={watchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="auvon-pill-btn-primary text-xs py-2 px-4"
                      >
                        Watch on YouTube
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* PLAYBACK RESTRICTION ALERT */}
              {playbackWarning && (
                <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] flex items-center justify-between gap-3 text-xs">
                  <span className="text-[var(--text-secondary)]">
                    If this video does not play due to creator permissions, you can watch it directly on YouTube.
                  </span>
                  {watchUrl && (
                    <a
                      href={watchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[var(--accent-primary)] hover:underline whitespace-nowrap"
                    >
                      Watch on YouTube →
                    </a>
                  )}
                </div>
              )}

              {/* VIDEO METADATA & ASSOCIATED TASK INFO */}
              <div className="auvon-card !p-6 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="auvon-telemetry-badge">
                      IN-APP VIDEO LESSON
                    </span>
                    {(video?.channel_title || video?.author_name) && (
                      <span className="font-mono text-xs text-[var(--text-muted)]">
                        by {video.channel_title || video.author_name}
                      </span>
                    )}
                  </div>

                  <h1 className="font-heading text-xl md:text-2xl font-bold text-[var(--text-primary)] leading-snug mt-1">
                    {video?.title || "Video Lesson"}
                  </h1>
                </div>

                {/* ASSOCIATED ROADMAP TASK CONTEXT */}
                {(taskText || goalTitle) && (
                  <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                        Associated Milestone Task
                      </span>
                      {goalTitle && (
                        <span className="font-mono text-xs text-[var(--accent-primary)] font-medium truncate max-w-[200px]">
                          {goalTitle}
                        </span>
                      )}
                    </div>
                    <p className="text-xs md:text-sm text-[var(--text-secondary)] leading-relaxed font-sans">
                      {taskText}
                    </p>
                  </div>
                )}

                {/* VIDEO DESCRIPTION */}
                {video?.description && (
                  <div className="text-xs text-[var(--text-secondary)] leading-relaxed border-t border-[var(--border-subtle)] pt-3 max-h-52 overflow-y-auto">
                    <p className="font-semibold text-[var(--text-primary)] mb-1">About this lesson:</p>
                    <p className="whitespace-pre-line text-[var(--text-muted)]">{video.description}</p>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: 1fr AI TOOLS & COMPANION CARD */}
            <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4">
              {/* AI LEARNING TOOLS */}
              <div className="auvon-card !p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-primary)]" />
                    <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      AI Learning Tools
                    </span>
                  </div>

                  {stepId && (
                    <button
                      type="button"
                      onClick={handleToggleStep}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                        taskCompleted
                          ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                          : "border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {taskCompleted ? "✓ Completed" : "Mark Task Done"}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {/* GENERATE NOTES BUTTON */}
                  <button
                    type="button"
                    onClick={() => handleGenerateNotes()}
                    disabled={generatingNotes || generatingQuiz}
                    className="auvon-pill-btn-primary text-xs py-2.5 px-3 cursor-pointer disabled:opacity-50"
                  >
                    {generatingNotes ? "Generating Notes..." : "Generate Notes"}
                  </button>

                  {/* GENERATE QUIZ BUTTON */}
                  <button
                    type="button"
                    onClick={() => handleGenerateQuiz()}
                    disabled={generatingNotes || generatingQuiz}
                    className="auvon-pill-btn-secondary text-xs py-2.5 px-3 cursor-pointer disabled:opacity-50"
                  >
                    {generatingQuiz ? "Generating Quiz..." : "Generate Quiz"}
                  </button>
                </div>

                {actionError && (
                  <p className="text-xs text-red-500 mt-1">{actionError}</p>
                )}
              </div>

              {/* GENERATED NOTES BANNER */}
              {generatedNote && (
                <div className="auvon-card !p-4 border-[var(--accent-border)] flex items-center justify-between gap-3 animate-fade-in shadow-sm">
                  <div className="min-w-0">
                    <h4 className="font-heading text-xs md:text-sm font-semibold text-[var(--text-primary)] truncate">
                      Study Notes Ready!
                    </h4>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">
                      Saved to your study library.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(`/note/${generatedNote.id}`)}
                    className="auvon-pill-btn-primary text-xs py-1.5 px-3 cursor-pointer flex-shrink-0"
                  >
                    Open Notes →
                  </button>
                </div>
              )}

              {/* GENERATED QUIZ BANNER */}
              {generatedQuiz && (
                <div className="auvon-card !p-4 border-[var(--accent-border)] flex items-center justify-between gap-3 animate-fade-in shadow-sm">
                  <div className="min-w-0">
                    <h4 className="font-heading text-xs md:text-sm font-semibold text-[var(--text-primary)] truncate">
                      Video Quiz Ready!
                    </h4>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">
                      {generatedQuiz.questions?.length || 5} questions generated.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(`/test/${generatedQuiz.test_id}`)}
                    className="auvon-pill-btn-primary text-xs py-1.5 px-3 cursor-pointer flex-shrink-0"
                  >
                    Take Quiz →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MANUAL TRANSCRIPT MODAL */}
        {showManualModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="auvon-card max-w-lg w-full !p-6 flex flex-col gap-4 text-left shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-lg font-semibold text-[var(--text-primary)]">
                  {modalMode === "notes" ? "Provide Content for AI Notes" : "Provide Content for Quiz"}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 cursor-pointer font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] text-xs text-[var(--text-secondary)] leading-relaxed">
                <p className="font-medium text-[var(--text-primary)] mb-1">
                  Why is manual input requested?
                </p>
                <p>{modalReason || "Direct video understanding and captions were unavailable for this video."}</p>
                <p className="mt-1.5 text-[var(--text-muted)]">
                  Paste transcript, lecture notes, or key takeaways below to generate structured study materials:
                </p>
              </div>

              <textarea
                value={customTranscript}
                onChange={(e) => setCustomTranscript(e.target.value)}
                placeholder="Paste video transcript or lecture notes here..."
                rows={6}
                className="w-full p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] text-xs font-sans placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
              />

              {modalMode === "quiz" && (
                <div className="flex items-center justify-between gap-4 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-muted)]">Difficulty:</span>
                    <select
                      value={quizDifficulty}
                      onChange={(e) => setQuizDifficulty(e.target.value)}
                      className="border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] rounded-full px-2.5 py-1 text-[var(--text-primary)]"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-muted)]">Questions:</span>
                    <select
                      value={quizQuestionsCount}
                      onChange={(e) => setQuizQuestionsCount(parseInt(e.target.value))}
                      className="border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] rounded-full px-2.5 py-1 text-[var(--text-primary)]"
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
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="auvon-pill-btn-secondary text-xs py-2 px-4 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (modalMode === "notes") {
                      handleGenerateNotes(customTranscript);
                    } else {
                      handleGenerateQuiz(customTranscript);
                    }
                  }}
                  disabled={!customTranscript.trim() || generatingNotes || generatingQuiz}
                  className="auvon-pill-btn-primary text-xs py-2 px-5 cursor-pointer disabled:opacity-50"
                >
                  {generatingNotes || generatingQuiz ? "Generating..." : `Generate ${modalMode === "notes" ? "Notes" : "Quiz"}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default VideoLesson;
