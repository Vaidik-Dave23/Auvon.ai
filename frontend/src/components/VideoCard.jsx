import { useNavigate } from "react-router-dom";
import { isVerifiedVideo, isDocResource, isLabResource, extractYouTubeId } from "../utils/youtube";

function VideoCard({ video, taskText, goalTitle, stepId, goalId, compact = false }) {
  const navigate = useNavigate();

  if (!video) return null;

  const rawId = video.id || video.video_id;
  const videoId = extractYouTubeId(rawId);
  const isVideo = isVerifiedVideo(video);
  const isDoc = isDocResource(video);
  const isLab = isLabResource(video);
  const isRepo = video.type === "repo" || video.type === "tool";

  const handleCardClick = (e) => {
    e.stopPropagation();
    if (isVideo && videoId) {
      navigate(`/learn/video/${videoId}`, {
        state: {
          video: {
            ...video,
            id: videoId,
            video_id: videoId,
          },
          taskText,
          goalTitle,
          stepId,
          goalId,
        },
      });
    } else if (video.url) {
      window.open(video.url, "_blank", "noopener,noreferrer");
    }
  };

  const handleActionClick = (e) => {
    e.stopPropagation();
    handleCardClick(e);
  };

  // ── 1. OFFICIAL DOCUMENTATION & GUIDES CARD ────────────────────────────────
  if (isDoc) {
    return (
      <div
        onClick={handleCardClick}
        className={`w-full mt-2.5 p-3 rounded-xl bg-surface border border-border-default hover:border-sky-500/60 transition-all duration-200 cursor-pointer group flex flex-col sm:flex-row gap-3.5 items-start sm:items-center justify-between text-left shadow-sm hover:shadow-md ${
          compact ? "p-2.5" : "p-3.5"
        }`}
        role="button"
        tabIndex={0}
        aria-label={`Open Documentation: ${video.title}`}
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          {/* ICON BADGE */}
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-sky-500/15 border border-sky-500/25 flex items-center justify-center flex-shrink-0 text-sky-400 group-hover:scale-105 group-hover:bg-sky-500 group-hover:text-white transition-all shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>

          {/* DETAILS */}
          <div className="min-w-0 flex-1 flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/20">
                Documentation
              </span>
              <span className="text-xs text-text-tertiary truncate font-mono">
                {video.domain || "Official Docs"}
              </span>
            </div>

            <h4
              className="font-serif text-sm font-medium text-text-primary group-hover:text-sky-400 transition-colors line-clamp-1 leading-snug"
              title={video.title}
            >
              {video.title}
            </h4>

            {video.description && !compact && (
              <p className="text-[11px] text-text-tertiary line-clamp-1">
                {video.description}
              </p>
            )}
          </div>
        </div>

        {/* ACTION BUTTON */}
        <button
          onClick={handleActionClick}
          className="self-stretch sm:self-center flex-shrink-0 px-3.5 py-1.5 rounded-lg bg-surface-alt hover:bg-sky-500 text-text-secondary hover:text-white border border-border group-hover:border-sky-500 text-xs font-semibold font-sans transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <span>Open Docs</span>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </button>
      </div>
    );
  }

  // ── 2. INTERACTIVE LABS & HANDS-ON PRACTICE CARD ───────────────────────────
  if (isLab) {
    return (
      <div
        onClick={handleCardClick}
        className={`w-full mt-2.5 p-3 rounded-xl bg-surface border border-border-default hover:border-purple-500/60 transition-all duration-200 cursor-pointer group flex flex-col sm:flex-row gap-3.5 items-start sm:items-center justify-between text-left shadow-sm hover:shadow-md ${
          compact ? "p-2.5" : "p-3.5"
        }`}
        role="button"
        tabIndex={0}
        aria-label={`Launch Lab: ${video.title}`}
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          {/* ICON BADGE */}
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-purple-500/15 border border-purple-500/25 flex items-center justify-center flex-shrink-0 text-purple-400 group-hover:scale-105 group-hover:bg-purple-500 group-hover:text-white transition-all shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.942a4.5 4.5 0 01-4.66 0L12 15.3m7.8 0A4.5 4.5 0 0121 19.2v.3a1.5 1.5 0 01-1.5 1.5H4.5A1.5 1.5 0 013 19.5v-.3a4.5 4.5 0 011.2-3.9l.8-.48" />
            </svg>
          </div>

          {/* DETAILS */}
          <div className="min-w-0 flex-1 flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/20">
                Interactive Lab
              </span>
              <span className="text-xs text-text-tertiary truncate font-mono">
                {video.domain || "Hands-on Practice"}
              </span>
            </div>

            <h4
              className="font-serif text-sm font-medium text-text-primary group-hover:text-purple-400 transition-colors line-clamp-1 leading-snug"
              title={video.title}
            >
              {video.title}
            </h4>

            {video.description && !compact && (
              <p className="text-[11px] text-text-tertiary line-clamp-1">
                {video.description}
              </p>
            )}
          </div>
        </div>

        {/* ACTION BUTTON */}
        <button
          onClick={handleActionClick}
          className="self-stretch sm:self-center flex-shrink-0 px-3.5 py-1.5 rounded-lg bg-surface-alt hover:bg-purple-500 text-text-secondary hover:text-white border border-border group-hover:border-purple-500 text-xs font-semibold font-sans transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <span>Launch Lab</span>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </button>
      </div>
    );
  }

  // ── 3. TOOL / OPEN SOURCE REPOSITORY CARD ──────────────────────────────────
  if (isRepo) {
    return (
      <div
        onClick={handleCardClick}
        className={`w-full mt-2.5 p-3 rounded-xl bg-surface border border-border-default hover:border-amber-500/60 transition-all duration-200 cursor-pointer group flex flex-col sm:flex-row gap-3.5 items-start sm:items-center justify-between text-left shadow-sm hover:shadow-md ${
          compact ? "p-2.5" : "p-3.5"
        }`}
        role="button"
        tabIndex={0}
        aria-label={`View Repository: ${video.title}`}
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          {/* ICON BADGE */}
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center flex-shrink-0 text-amber-400 group-hover:scale-105 group-hover:bg-amber-500 group-hover:text-white transition-all shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
            </svg>
          </div>

          {/* DETAILS */}
          <div className="min-w-0 flex-1 flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">
                Official Tool / Repo
              </span>
              <span className="text-xs text-text-tertiary truncate font-mono">
                {video.domain || "GitHub"}
              </span>
            </div>

            <h4
              className="font-serif text-sm font-medium text-text-primary group-hover:text-amber-400 transition-colors line-clamp-1 leading-snug"
              title={video.title}
            >
              {video.title}
            </h4>

            {video.description && !compact && (
              <p className="text-[11px] text-text-tertiary line-clamp-1">
                {video.description}
              </p>
            )}
          </div>
        </div>

        {/* ACTION BUTTON */}
        <button
          onClick={handleActionClick}
          className="self-stretch sm:self-center flex-shrink-0 px-3.5 py-1.5 rounded-lg bg-surface-alt hover:bg-amber-500 text-text-secondary hover:text-white border border-border group-hover:border-amber-500 text-xs font-semibold font-sans transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <span>View Repo</span>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </button>
      </div>
    );
  }

  // ── 4. VERIFIED VIDEO CARD ────────────────────────────────────────────────
  if (isVideo) {
    const thumbnail =
      video.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    return (
      <div
        onClick={handleCardClick}
        className={`w-full mt-2.5 p-3 rounded-xl bg-surface border border-border-default hover:border-accent/80 transition-all duration-200 cursor-pointer group flex flex-col sm:flex-row gap-3.5 items-start sm:items-center justify-between text-left shadow-sm hover:shadow-md ${
          compact ? "p-2.5" : "p-3.5"
        }`}
        role="button"
        tabIndex={0}
        aria-label={`Play video: ${video.title}`}
      >
        <div className="flex items-center gap-3.5 min-w-0 w-full sm:w-auto flex-1">
          {/* THUMBNAIL WITH PLAY OVERLAY */}
          <div className="relative w-28 sm:w-32 aspect-video rounded-lg overflow-hidden bg-surface-alt flex-shrink-0 border border-border-subtle group-hover:border-accent/50 transition-all">
            <img
              src={thumbnail}
              alt={video.title || "Video thumbnail"}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 flex items-center justify-center transition-colors">
              <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4 ml-0.5"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* DETAILS */}
          <div className="min-w-0 flex-1 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/20">
                Video Lesson
              </span>
              {video.channel_title && (
                <span className="text-xs text-text-tertiary truncate">
                  {video.channel_title}
                </span>
              )}
            </div>

            <h4
              className="font-serif text-sm font-medium text-text-primary group-hover:text-accent transition-colors line-clamp-1 leading-snug"
              title={video.title}
            >
              {video.title}
            </h4>
          </div>
        </div>

        {/* ACTION BUTTON */}
        <button
          onClick={handleActionClick}
          className="self-stretch sm:self-center flex-shrink-0 px-4 py-2 rounded-lg bg-control hover:bg-accent text-text-primary hover:text-white border border-border group-hover:border-accent text-xs font-semibold font-sans transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-3.5 h-3.5"
          >
            <path
              fillRule="evenodd"
              d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z"
              clipRule="evenodd"
            />
          </svg>
          <span>Play Video</span>
        </button>
      </div>
    );
  }

  // ── 5. SEARCH FALLBACK CARD ────────────────────────────────────────────────
  return (
    <div
      onClick={handleCardClick}
      className="w-full mt-2.5 p-3 rounded-lg bg-surface border border-dashed border-border-default hover:border-accent/60 transition-all cursor-pointer group flex items-center justify-between gap-3 text-left"
      role="button"
      tabIndex={0}
      aria-label={`Search for ${video.title || "tutorial"}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0 text-accent group-hover:bg-accent group-hover:text-white transition-colors">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-5 h-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-alt border border-border text-text-tertiary">
              Search Guide
            </span>
            <span className="text-xs text-text-tertiary truncate">
              Learning Resource
            </span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-text-primary group-hover:text-accent transition-colors truncate mt-0.5">
            {video.title || `Search resources: ${taskText || "Topic"}`}
          </p>
        </div>
      </div>

      <button
        onClick={handleActionClick}
        className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded bg-surface-alt hover:bg-accent hover:text-white border border-border text-text-secondary transition-all flex items-center gap-1.5 cursor-pointer"
      >
        <span>Search</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="w-3.5 h-3.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
          />
        </svg>
      </button>
    </div>
  );
}

export default VideoCard;
