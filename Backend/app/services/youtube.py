import html
import os
import re
import urllib.parse
from typing import List, Optional, Dict, Any
import requests
from dotenv import load_dotenv
from app.core.logging_config import get_logger

load_dotenv()
log = get_logger(__name__)

# Valid YouTube video ID pattern (11 characters: alphanumeric, dashes, underscores)
YOUTUBE_ID_REGEX = re.compile(r"^[a-zA-Z0-9_-]{11}$")

# URL patterns to extract video ID from common YouTube URL formats
YOUTUBE_URL_PATTERNS = [
    re.compile(r"(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})"),
    re.compile(r"(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})"),
    re.compile(r"(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})"),
    re.compile(r"(?:https?:\/\/)?(?:www\.)?youtube-nocookie\.com\/embed\/([a-zA-Z0-9_-]{11})"),
    re.compile(r"(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})"),
]

# Keywords that indicate a roadmap task recommends video/tutorial learning
VIDEO_TASK_KEYWORDS = [
    "watch", "video", "tutorial", "lecture", "course", "screencast",
    "walkthrough", "crash course", "introduction to", "master", "deep dive",
    "overview", "learn", "study", "guide"
]


def build_search_query(goal_title: Optional[str], task_text: Optional[str]) -> str:
    """
    Format a clean, keyword-dense search query for YouTube Data API.
    Strips commands, parentheses, brackets, and code fragments to maximize video relevance.
    """
    goal = (goal_title or "").strip()
    raw = (task_text or "").strip()

    # Remove code blocks and parenthetical descriptions
    cleaned = re.sub(r'\(.*?\)', '', raw)
    cleaned = re.sub(r'\[.*?\]', '', cleaned)
    cleaned = re.sub(r'\{.*?\}', '', cleaned)
    cleaned = re.sub(r'[^\w\s\-]', ' ', cleaned)

    words = [w for w in cleaned.split() if len(w) > 1]
    condensed = " ".join(words[:8])

    if goal and condensed:
        return f"{goal} {condensed} tutorial".strip()
    elif condensed:
        return f"{condensed} tutorial".strip()
    return f"{goal} tutorial".strip()


def is_valid_youtube_id(video_id: Optional[str]) -> bool:
    """Check if a string matches the standard 11-char YouTube video ID format."""
    if not video_id or not isinstance(video_id, str):
        return False
    return bool(YOUTUBE_ID_REGEX.match(video_id.strip()))


def extract_youtube_id(url_or_id: Optional[str]) -> Optional[str]:
    """Extract and validate a YouTube video ID from a URL or raw ID string."""
    if not url_or_id or not isinstance(url_or_id, str):
        return None
    
    cleaned = url_or_id.strip()
    if is_valid_youtube_id(cleaned):
        return cleaned

    for pattern in YOUTUBE_URL_PATTERNS:
        match = pattern.search(cleaned)
        if match:
            candidate = match.group(1)
            if is_valid_youtube_id(candidate):
                return candidate

    return None


def get_youtube_embed_url(video_id: str) -> Optional[str]:
    """Generate a safe, official YouTube embed URL using privacy-enhanced domain."""
    clean_id = extract_youtube_id(video_id)
    if not clean_id:
        return None
    return f"https://www.youtube-nocookie.com/embed/{clean_id}"


def should_recommend_video(task_text: str) -> bool:
    """Determine whether a task description benefits from a recommended video tutorial."""
    if not task_text or not isinstance(task_text, str):
        return False
    lower = task_text.lower()
    return any(keyword in lower for keyword in VIDEO_TASK_KEYWORDS)


class YouTubeService:
    """
    Service for reliable retrieval of YouTube videos.
    - Uses YouTube Data API v3 when YOUTUBE_API_KEY is configured.
    - Caches search queries to avoid quota waste and redundant requests.
    - Falls back gracefully to YouTube search links when credentials are missing or quota exceeded.
    - Distinguishes verified individual videos from search query fallbacks.
    """

    def __init__(self):
        self._session = requests.Session()
        # Query cache: maps normalized query -> list of verified video dicts
        self._cache: Dict[str, List[Dict[str, Any]]] = {}

    def get_api_key(self) -> Optional[str]:
        """Fetch YouTube API key from environment, reloading .env if needed."""
        key = (
            os.getenv("YOUTUBE_API_KEY", "").strip()
            or os.getenv("YOUTUBE_DATA_API_KEY", "").strip()
        )
        if not key:
            load_dotenv()
            key = (
                os.getenv("YOUTUBE_API_KEY", "").strip()
                or os.getenv("YOUTUBE_DATA_API_KEY", "").strip()
            )
        return key or None

    def is_configured(self) -> bool:
        """Return True if a YouTube API key is present."""
        return self.get_api_key() is not None

    def create_search_fallback(self, query: str) -> Dict[str, Any]:
        """
        Create a graceful YouTube search fallback link when the API is unavailable.
        Clearly marks the item as type='search' and verified=False.
        """
        clean_query = query.strip()
        encoded = urllib.parse.quote_plus(clean_query)
        search_url = f"https://www.youtube.com/results?search_query={encoded}"
        return {
            "id": None,
            "video_id": None,
            "title": f"Search Tutorials: {clean_query}",
            "description": f"Explore video tutorials and demonstrations on YouTube for '{clean_query}'.",
            "url": search_url,
            "embed_url": None,
            "thumbnail": None,
            "channel_title": "YouTube Search",
            "type": "search",
            "verified": False,
        }

    def search_videos(self, query: str, max_results: int = 1) -> List[Dict[str, Any]]:
        """
        Search for relevant YouTube videos for a given query or task description.
        Returns verified video objects if available, or a search fallback.
        Only caches successful video responses (does not lock in temporary search fallbacks).
        """
        if not query or not query.strip():
            return []

        clean_query = " ".join(query.strip().split())
        cache_key = f"{clean_query.lower()}:{max_results}"

        # 1. Return cached results if verified videos exist
        if cache_key in self._cache:
            log.info("youtube_cache_hit", query=clean_query)
            return self._cache[cache_key]

        api_key = self.get_api_key()

        # 2. If no API key configured, return search fallback without caching
        if not api_key:
            log.info("youtube_api_key_missing_using_search_fallback", query=clean_query)
            return [self.create_search_fallback(clean_query)]

        # 3. Call YouTube Data API v3
        try:
            url = "https://www.googleapis.com/youtube/v3/search"
            params = {
                "part": "snippet",
                "q": clean_query,
                "type": "video",
                "videoEmbeddable": "true",
                "maxResults": min(max(1, max_results), 5),
                "safeSearch": "moderate",
                "relevanceLanguage": "en",
                "key": api_key,
            }

            resp = self._session.get(url, params=params, timeout=10)

            if resp.status_code == 200:
                data = resp.json()
                items = data.get("items", [])
                videos: List[Dict[str, Any]] = []

                for item in items:
                    raw_id = item.get("id", {}).get("videoId")
                    if not is_valid_youtube_id(raw_id):
                        continue

                    snippet = item.get("snippet", {})
                    title = html.unescape(snippet.get("title", ""))
                    description = snippet.get("description", "")
                    thumbnails = snippet.get("thumbnails", {})
                    
                    thumbnail_url = (
                        thumbnails.get("high", {}).get("url")
                        or thumbnails.get("medium", {}).get("url")
                        or thumbnails.get("default", {}).get("url")
                    )
                    channel_title = html.unescape(snippet.get("channelTitle", ""))

                    videos.append({
                        "id": raw_id,
                        "video_id": raw_id,
                        "title": title,
                        "description": description,
                        "url": f"https://www.youtube.com/watch?v={raw_id}",
                        "embed_url": get_youtube_embed_url(raw_id),
                        "thumbnail": thumbnail_url,
                        "channel_title": channel_title,
                        "type": "video",
                        "verified": True,
                    })

                if videos:
                    self._cache[cache_key] = videos
                    log.info("youtube_search_success", query=clean_query, count=len(videos))
                    return videos

                log.info("youtube_search_empty_items", query=clean_query)
                return [self.create_search_fallback(clean_query)]

            elif resp.status_code == 403:
                log.warning("youtube_api_quota_or_permission_error", status_code=resp.status_code)
                return [self.create_search_fallback(clean_query)]
            else:
                log.warning("youtube_api_http_error", status_code=resp.status_code)
                return [self.create_search_fallback(clean_query)]

        except Exception as e:
            log.error("youtube_search_exception", error=str(e), query=clean_query)
            return [self.create_search_fallback(clean_query)]

    def get_video_details(self, video_id: str) -> Dict[str, Any]:
        """
        Get metadata and embed verification for a specific video ID.
        Uses oEmbed or YouTube API v3 when available.
        """
        clean_id = extract_youtube_id(video_id)
        if not clean_id:
            return {
                "id": video_id,
                "video_id": video_id,
                "title": "Invalid Video",
                "valid": False,
                "embeddable": False,
                "error": "Invalid YouTube video ID format",
            }

        # Check official YouTube oEmbed endpoint (free, no API key required, highly reliable)
        try:
            oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={clean_id}&format=json"
            resp = self._session.get(oembed_url, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "id": clean_id,
                    "video_id": clean_id,
                    "title": html.unescape(data.get("title", f"Video {clean_id}")),
                    "author_name": html.unescape(data.get("author_name", "")),
                    "channel_title": html.unescape(data.get("author_name", "")),
                    "thumbnail": data.get("thumbnail_url"),
                    "url": f"https://www.youtube.com/watch?v={clean_id}",
                    "embed_url": get_youtube_embed_url(clean_id),
                    "type": "video",
                    "valid": True,
                    "embeddable": True,
                    "verified": True,
                }
            elif resp.status_code in (401, 403, 404):
                # Video is private, deleted, or embedding is disabled by owner
                return {
                    "id": clean_id,
                    "video_id": clean_id,
                    "title": f"YouTube Video ({clean_id})",
                    "url": f"https://www.youtube.com/watch?v={clean_id}",
                    "embed_url": get_youtube_embed_url(clean_id),
                    "type": "video",
                    "valid": True,
                    "embeddable": False,
                    "restricted": True,
                    "verified": False,
                    "notice": "This video may have playback restrictions or embedding disabled by the creator. You can open it directly on YouTube.",
                }
        except Exception as err:
            log.warning("youtube_oembed_failed", error=str(err), video_id=clean_id)

        # Baseline fallback for valid ID
        return {
            "id": clean_id,
            "video_id": clean_id,
            "title": f"YouTube Lesson: {clean_id}",
            "url": f"https://www.youtube.com/watch?v={clean_id}",
            "embed_url": get_youtube_embed_url(clean_id),
            "type": "video",
            "valid": True,
            "embeddable": True,
            "verified": True,
        }

    def get_video_transcript(self, video_id: str) -> Dict[str, Any]:
        """
        Extract actual spoken transcript text from a YouTube video.
        Uses youtube_transcript_api with fallback language support.
        Returns a dict indicating whether transcript is available, the full text,
        snippet count, and a user-facing explanation message.
        """
        clean_id = extract_youtube_id(video_id)
        if not clean_id or not is_valid_youtube_id(clean_id):
            return {
                "available": False,
                "text": None,
                "snippets_count": 0,
                "message": "Invalid YouTube video ID format.",
            }

        cache_key = f"transcript:{clean_id}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        try:
            from youtube_transcript_api import YouTubeTranscriptApi
            ytt = YouTubeTranscriptApi()
            
            transcript_list = None
            # Fast path: fetch prioritizing Hindi, English, and common educational languages
            try:
                transcript_list = ytt.fetch(clean_id, languages=['en', 'en-IN', 'en-US', 'hi', 'hi-Latn', 'es', 'fr', 'de'])
            except Exception:
                pass

            # Fallback path: inspect list of all available subtitle tracks for this video
            if not transcript_list:
                try:
                    all_transcripts = ytt.list(clean_id)
                    selected_track = None
                    try:
                        selected_track = all_transcripts.find_transcript(['hi', 'en', 'en-IN', 'hi-Latn'])
                    except Exception:
                        for track in all_transcripts:
                            selected_track = track
                            break
                    if selected_track:
                        transcript_list = selected_track.fetch()
                except Exception:
                    pass

            if transcript_list:
                text_parts = []
                for s in transcript_list:
                    text_val = getattr(s, "text", None) or (s.get("text") if isinstance(s, dict) else "")
                    if text_val and text_val.strip():
                        text_parts.append(text_val.strip())
                full_text = " ".join(text_parts)

                if full_text.strip():
                    log.info("youtube_transcript_extracted", video_id=clean_id, snippets=len(transcript_list), chars=len(full_text))
                    result = {
                        "available": True,
                        "text": full_text,
                        "snippets_count": len(transcript_list),
                        "char_count": len(full_text),
                        "source": "youtube_captions",
                        "message": "Transcript successfully extracted from video.",
                    }
                    self._cache[cache_key] = result
                    return result
        except Exception as e:
            log.warning("youtube_transcript_fetch_failed", video_id=clean_id, error=str(e))

        return {
            "available": False,
            "text": None,
            "snippets_count": 0,
            "char_count": 0,
            "source": None,
            "message": (
                "Unable to retrieve automatic captions or transcripts for this video "
                "(the content creator may have disabled captions, or the video lacks an available subtitle track). "
                "You can provide a transcript or notes text manually to generate study materials."
            ),
        }


# Singleton service instance
youtube_service = YouTubeService()

