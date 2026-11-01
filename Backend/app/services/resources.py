"""
Unified Learning Resource Resolver Service.
Determines the most authoritative, relevant learning resource for any task or milestone:
- Official Documentation (e.g. OWASP, MDN, PortSwigger, Semgrep, Trivy, Docker, GitHub Actions, Python, React)
- Interactive Labs & Practice (e.g. PortSwigger Web Security Academy, OWASP Juice Shop, LeetCode)
- Official Tool / Repositories (e.g. Gitleaks, Threat Dragon)
- Verified Video Lessons (YouTube tutorials when visual learning or walkthroughs are needed)
"""

import re
import urllib.parse
from typing import List, Dict, Any, Optional
from app.services.youtube import youtube_service, is_valid_youtube_id, extract_youtube_id, build_search_query
from app.core.logging_config import get_logger

log = get_logger(__name__)

# Keywords indicating that a task explicitly asks for or heavily benefits from a video lesson
VIDEO_EXPLICIT_KEYWORDS = [
    "watch", "video", "screencast", "lecture", "visual walkthrough",
    "video tutorial", "crash course", "video lesson", "recorded", "webinar"
]

# Curated knowledge catalog of authoritative resources
AUTHORITATIVE_CATALOG: List[Dict[str, Any]] = [
    # ── OWASP & Threat Modeling ──────────────────────────────────────────
    {
        "patterns": [r"threat\s*dragon", r"owasp.*threat.*dragon"],
        "type": "repo",
        "title": "OWASP Threat Dragon — Threat Modeling Tool & Documentation",
        "url": "https://owasp.org/www-project-threat-dragon/",
        "domain": "owasp.org",
        "description": "Open source diagramming tool supporting STRIDE threat modeling methodologies.",
    },
    {
        "patterns": [r"juice\s*shop", r"owasp.*juice\s*shop"],
        "type": "lab",
        "title": "OWASP Juice Shop — Official Insecure Web Application & Guide",
        "url": "https://owasp.org/www-project-juice-shop/",
        "domain": "owasp.org",
        "description": "Modern intentionally insecure web app for hands-on security challenges and CTFs.",
    },
    {
        "patterns": [r"owasp\s*top\s*10", r"top\s*10.*vulnerabilit"],
        "type": "doc",
        "title": "OWASP Top 10 Official Standard & Documentation",
        "url": "https://owasp.org/www-project-top-ten/",
        "domain": "owasp.org",
        "description": "The globally recognized awareness document for web application security risks.",
    },
    {
        "patterns": [r"\bstride\b", r"threat\s*model"],
        "type": "doc",
        "title": "OWASP Threat Modeling Cheat Sheet & STRIDE Guide",
        "url": "https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html",
        "domain": "cheatsheetseries.owasp.org",
        "description": "Structured guide for STRIDE categorization, threat analysis, and component review.",
    },
    {
        "patterns": [r"owasp.*cheat\s*sheet", r"cheat\s*sheet\s*series"],
        "type": "doc",
        "title": "OWASP Cheat Sheet Series",
        "url": "https://cheatsheetseries.owasp.org/",
        "domain": "cheatsheetseries.owasp.org",
        "description": "High-value guidance documentation for secure application architecture and defense.",
    },

    # ── CI/CD & DevOps Infrastructure ────────────────────────────────────
    {
        "patterns": [r"github\s*action", r"\.github\/workflows", r"github.*workflow"],
        "type": "doc",
        "title": "GitHub Actions Official Documentation & Workflow Syntax",
        "url": "https://docs.github.com/en/actions/writing-workflows",
        "domain": "docs.github.com",
        "description": "Official reference documentation for CI/CD workflow automation, triggers, and syntax.",
    },

    # ── Specific Security Protocols & Vulnerabilities ─────────────────────
    {
        "patterns": [r"\bjwt\b", r"json\s*web\s*token"],
        "type": "doc",
        "title": "PortSwigger Web Security Academy: JWT Attacks & Vulnerabilities",
        "url": "https://portswigger.net/web-security/jwt",
        "domain": "portswigger.net",
        "description": "Detailed guide and practice labs analyzing algorithm confusion and token forgery.",
    },
    {
        "patterns": [r"\bidor\b", r"insecure\s*direct\s*object"],
        "type": "lab",
        "title": "PortSwigger Web Security Academy: IDOR & Access Control Labs",
        "url": "https://portswigger.net/web-security/access-control/idor",
        "domain": "portswigger.net",
        "description": "Interactive practical exercises exploring insecure direct object references.",
    },
    {
        "patterns": [r"\bssrf\b", r"server-side\s*request\s*forgery"],
        "type": "lab",
        "title": "PortSwigger Web Security Academy: SSRF Vulnerabilities & Labs",
        "url": "https://portswigger.net/web-security/ssrf",
        "domain": "portswigger.net",
        "description": "Hands-on labs detailing Server-Side Request Forgery attack vectors and mitigations.",
    },
    {
        "patterns": [r"sql\s*injection", r"\bsqli\b"],
        "type": "lab",
        "title": "PortSwigger Web Security Academy: SQL Injection Interactive Labs",
        "url": "https://portswigger.net/web-security/sql-injection",
        "domain": "portswigger.net",
        "description": "Exploiting SQL injection vulnerabilities and understanding defensive parameterized queries.",
    },
    {
        "patterns": [r"\bxss\b", r"cross-site\s*scripting"],
        "type": "doc",
        "title": "PortSwigger Web Security Academy: Cross-Site Scripting (XSS)",
        "url": "https://portswigger.net/web-security/cross-site-scripting",
        "domain": "portswigger.net",
        "description": "Comprehensive documentation on Stored, Reflected, and DOM-based XSS attacks.",
    },

    # ── PortSwigger & Burp Suite ─────────────────────────────────────────
    {
        "patterns": [r"portswigger.*academy", r"web\s*security\s*academy", r"portswigger.*lab"],
        "type": "lab",
        "title": "PortSwigger Web Security Academy — Interactive Labs & Documentation",
        "url": "https://portswigger.net/web-security/all-labs",
        "domain": "portswigger.net",
        "description": "Free online hands-on security training with interactive vulnerable lab environments.",
    },
    {
        "patterns": [r"burp\s*suite"],
        "type": "doc",
        "title": "PortSwigger Burp Suite Official Documentation & User Guide",
        "url": "https://portswigger.net/burp/documentation/desktop",
        "domain": "portswigger.net",
        "description": "Official guides for Proxy interception, Repeater, Intruder, and extensions.",
    },

    # ── DevSecOps & Security Scanners ────────────────────────────────────
    {
        "patterns": [r"\bsemgrep\b"],
        "type": "doc",
        "title": "Semgrep Official Documentation & Custom Rule Writing Guide",
        "url": "https://semgrep.dev/docs/writing-rules/overview/",
        "domain": "semgrep.dev",
        "description": "Documentation for fast static analysis (SAST) and authoring pattern-matching rules.",
    },
    {
        "patterns": [r"\btrivy\b"],
        "type": "doc",
        "title": "Aqua Security Trivy — Official Security Scanner Documentation",
        "url": "https://aquasecurity.github.io/trivy/latest/",
        "domain": "aquasecurity.github.io",
        "description": "Comprehensive scanner for container images, file systems, Git repositories, and SBOM.",
    },
    {
        "patterns": [r"\bgitleaks\b"],
        "type": "repo",
        "title": "Gitleaks — Secrets Detection Engine & Documentation",
        "url": "https://github.com/gitleaks/gitleaks",
        "domain": "github.com",
        "description": "Protect and discover secrets, API keys, and credentials across Git commits and CI/CD.",
    },
    {
        "patterns": [r"\bsast\b", r"static\s*application\s*security\s*testing"],
        "type": "doc",
        "title": "OWASP Source Code Analysis (SAST) Standards & Tools Guide",
        "url": "https://owasp.org/www-community/Source_Code_Analysis_Tools",
        "domain": "owasp.org",
    },
    {
        "patterns": [r"docker\s*compose"],
        "type": "doc",
        "title": "Docker Compose Official Documentation & CLI Reference",
        "url": "https://docs.docker.com/compose/",
        "domain": "docs.docker.com",
        "description": "Defining and running multi-container Docker applications with YAML configurations.",
    },
    {
        "patterns": [r"\bdocker\b"],
        "type": "doc",
        "title": "Docker Official Documentation & Guides",
        "url": "https://docs.docker.com/get-started/",
        "domain": "docs.docker.com",
        "description": "Official guides for building, running, and managing containerized applications.",
    },
    {
        "patterns": [r"kubernetes", r"\bk8s\b"],
        "type": "doc",
        "title": "Kubernetes Official Documentation & Architecture Guide",
        "url": "https://kubernetes.io/docs/home/",
        "domain": "kubernetes.io",
        "description": "Production-grade container orchestration documentation, pods, services, and ingresses.",
    },

    # ── Web Headers & Browser Security ───────────────────────────────────
    {
        "patterns": [r"content\s*security\s*policy", r"\bcsp\b", r"\bhsts\b", r"secure\s*cookie", r"http.*header"],
        "type": "doc",
        "title": "MDN Web Docs: Content Security Policy (CSP) & Web Security Headers",
        "url": "https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP",
        "domain": "developer.mozilla.org",
        "description": "Official developer standards for implementing defense-in-depth HTTP security headers.",
    },

    # ── Web Frameworks & Programming Languages ──────────────────────────
    {
        "patterns": [r"\bfastapi\b"],
        "type": "doc",
        "title": "FastAPI Official Documentation & Tutorial",
        "url": "https://fastapi.tiangolo.com/tutorial/",
        "domain": "fastapi.tiangolo.com",
        "description": "High performance Python web framework documentation with automatic OpenAPI docs.",
    },
    {
        "patterns": [r"\breact(?:\.js)?\b"],
        "type": "doc",
        "title": "React Official Documentation & Interactive Guides",
        "url": "https://react.dev/learn",
        "domain": "react.dev",
        "description": "The official documentation for React, Hooks, state management, and component architecture.",
    },
    {
        "patterns": [r"\bnext(?:\.js)?\b"],
        "type": "doc",
        "title": "Next.js Official Documentation",
        "url": "https://nextjs.org/docs",
        "domain": "nextjs.org",
        "description": "React framework for the web: Server Components, App Router, and deployment.",
    },
    {
        "patterns": [r"\bpython\b"],
        "type": "doc",
        "title": "Python 3 Official Documentation & Tutorial",
        "url": "https://docs.python.org/3/tutorial/",
        "domain": "docs.python.org",
        "description": "Standard documentation, built-in modules, syntax specifications, and best practices.",
    },
    {
        "patterns": [r"postgresql", r"postgres"],
        "type": "doc",
        "title": "PostgreSQL Official Documentation",
        "url": "https://www.postgresql.org/docs/current/",
        "domain": "postgresql.org",
        "description": "The world's most advanced open-source relational database documentation.",
    },
    {
        "patterns": [r"\bleetcode\b", r"dsa\b", r"data\s*structure.*algorithm"],
        "type": "lab",
        "title": "LeetCode Problem Set & Coding Practice",
        "url": "https://leetcode.com/problemset/",
        "domain": "leetcode.com",
        "description": "Interactive coding challenges for algorithms, data structures, and interview prep.",
    },
    {
        "patterns": [r"pytorch"],
        "type": "doc",
        "title": "PyTorch Official Documentation & Tutorials",
        "url": "https://pytorch.org/tutorials/",
        "domain": "pytorch.org",
        "description": "Deep learning platform documentation, tensor operations, neural network modules, and autograd.",
    },
]


def match_authoritative_resource(text: str) -> Optional[Dict[str, Any]]:
    """
    Search the authoritative resource catalog for a regex match in task text.
    Returns a structured resource dict if a high-confidence match is found.
    """
    if not text or not isinstance(text, str):
        return None

    lower_text = text.lower()
    for entry in AUTHORITATIVE_CATALOG:
        for pattern in entry["patterns"]:
            if re.search(pattern, lower_text, re.IGNORECASE):
                return {
                    "id": f"res_{entry['domain']}_{entry['type']}",
                    "title": entry["title"],
                    "url": entry["url"],
                    "domain": entry["domain"],
                    "description": entry.get("description", ""),
                    "type": entry["type"],
                    "verified": True,
                }
    return None


def should_recommend_video_only(task_text: str) -> bool:
    """
    Determine whether a task explicitly requests video instruction.
    Strictly checks for video-explicit terms (e.g. 'watch', 'video tutorial', 'screencast').
    """
    if not task_text or not isinstance(task_text, str):
        return False
    lower = task_text.lower()
    return any(keyword in lower for keyword in VIDEO_EXPLICIT_KEYWORDS)


def resolve_best_resources(
    goal_title: Optional[str],
    task_text: str,
    ai_resource: Optional[Dict[str, Any]] = None,
    allow_video_fallback: bool = True,
) -> List[Dict[str, Any]]:
    """
    Determine the optimal learning resource(s) for a task.
    Prioritizes official documentation, interactive labs, and repositories.
    Provides video lessons when requested or appropriate.
    """
    # 1. Check if AI already provided a specific valid URL or resource
    if ai_resource and isinstance(ai_resource, dict):
        r_url = ai_resource.get("resource_url")
        r_type = ai_resource.get("resource_type") or "doc"
        r_title = ai_resource.get("resource_title") or f"{r_type.capitalize()} Resource"
        if r_url and r_url.startswith("http"):
            domain = urllib.parse.urlparse(r_url).netloc
            return [{
                "id": f"ai_res_{domain}",
                "title": r_title,
                "url": r_url,
                "domain": domain,
                "type": r_type if r_type in ["doc", "lab", "repo", "guide", "video"] else "doc",
                "verified": True,
            }]
        elif r_type == "video" and ai_resource.get("video_query"):
            try:
                search_q = build_search_query(goal_title, ai_resource["video_query"])
                vids = youtube_service.search_videos(query=search_q, max_results=1)
                if vids and vids[0].get("verified"):
                    return vids
            except Exception:
                pass

    # 2. If task explicitly asks for a video, fetch a verified YouTube tutorial
    if should_recommend_video_only(task_text) and allow_video_fallback:
        try:
            search_q = build_search_query(goal_title, task_text)
            vids = youtube_service.search_videos(query=search_q, max_results=1)
            if vids and vids[0].get("verified"):
                return vids
        except Exception as e:
            log.warning("video_search_for_explicit_task_failed", error=str(e))

    # 3. Check authoritative catalog for high-precision docs, labs, or tools
    matched = match_authoritative_resource(task_text)
    if not matched and goal_title:
        matched = match_authoritative_resource(f"{goal_title} {task_text}")

    if matched:
        return [matched]

    # 4. Fallback: Search YouTube video if configured
    if allow_video_fallback and youtube_service.is_configured():
        try:
            search_q = build_search_query(goal_title, task_text)
            vids = youtube_service.search_videos(query=search_q, max_results=1)
            if vids and vids[0].get("verified"):
                return vids
        except Exception:
            pass

    # 5. Final fallback: Developer documentation search guide
    clean_task = re.sub(r'\(.*?\)', '', task_text).strip()
    words = [w for w in clean_task.split() if len(w) > 2][:6]
    search_terms = " ".join(words)
    doc_query = urllib.parse.quote_plus(f"{search_terms} documentation guide")

    return [
        {
            "id": None,
            "title": f"Official Guide & Docs: {search_terms}",
            "url": f"https://www.google.com/search?q={doc_query}",
            "domain": "google.com",
            "type": "doc",
            "verified": False,
        }
    ]
