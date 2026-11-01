// Strict regex for valid YouTube video IDs (11 characters: alphanumeric, dashes, underscores)
export const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export const isValidYouTubeId = (videoId) => {
  if (!videoId || typeof videoId !== "string") return false;
  return YOUTUBE_ID_REGEX.test(videoId.trim());
};

export const extractYouTubeId = (urlOrId) => {
  if (!urlOrId || typeof urlOrId !== "string") return null;

  const cleaned = urlOrId.trim();
  if (isValidYouTubeId(cleaned)) {
    return cleaned;
  }

  // Common YouTube URL regex patterns
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube-nocookie\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match && isValidYouTubeId(match[1])) {
      return match[1];
    }
  }

  return null;
};

export const getYouTubeEmbedUrl = (videoId, autoplay = false) => {
  const cleanId = extractYouTubeId(videoId);
  if (!cleanId) return null;
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    enablejsapi: "1"
  });
  if (autoplay) {
    params.set("autoplay", "1");
  }
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(cleanId)}?${params.toString()}`;
};

export const getYouTubeWatchUrl = (videoId) => {
  const cleanId = extractYouTubeId(videoId);
  if (!cleanId) return null;
  return `https://www.youtube.com/watch?v=${encodeURIComponent(cleanId)}`;
};

export const getYouTubeSearchUrl = (query) => {
  if (!query) return "https://www.youtube.com";
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
};

export const isVerifiedVideo = (video) => {
  if (!video || typeof video !== "object") return false;
  if (video.type && video.type !== "video") return false;
  const rawId = video.id || video.video_id;
  const cleanId = extractYouTubeId(rawId);
  return Boolean(
    cleanId &&
    isValidYouTubeId(cleanId) &&
    video.type !== "search" &&
    video.verified !== false
  );
};

export const isDocResource = (r) => {
  if (!r || typeof r !== "object") return false;
  return Boolean((r.type === "doc" || r.type === "documentation" || r.type === "guide") && r.url);
};

export const isLabResource = (r) => {
  if (!r || typeof r !== "object") return false;
  return Boolean((r.type === "lab" || r.type === "practice" || r.type === "repo" || r.type === "tool") && r.url);
};

export const isAnyVerifiedResource = (r) => {
  if (!r || typeof r !== "object") return false;
  if (isVerifiedVideo(r)) return true;
  return Boolean((isDocResource(r) || isLabResource(r)) && r.verified !== false);
};

export const isSearchFallback = (video) => {
  if (!video || typeof video !== "object") return true;
  return !isAnyVerifiedResource(video);
};

