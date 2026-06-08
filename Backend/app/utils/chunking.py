"""
Smart semantic chunker for RAG pipelines.

Strategy:
  1. Split by headers (## / ###) to keep topic boundaries intact
  2. Within each section, split by paragraphs
  3. If a paragraph is still too large, split by sentences with overlap
  4. Attach section title as prefix to every chunk so retrieval has context

Result: chunks are self-contained, carry their topic header,
        and overlap slightly so answers don't fall between two chunks.
"""

import re


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences on .!? boundaries."""
    # Handle abbreviations like "e.g.", "i.e.", "Fig.", etc.
    # by protecting them before splitting
    text = re.sub(r'\b(e\.g|i\.e|Fig|Dr|Mr|Mrs|Ms|Prof|vs|etc|approx|no)\.\s', r'\1<DOT> ', text)
    sentences = re.split(r'(?<=[.!?])\s+', text)
    # Restore protected dots
    return [s.replace('<DOT>', '.') for s in sentences if s.strip()]


def _chunk_section(title: str, body: str, max_size: int, overlap: int) -> list[str]:
    """
    Chunk a single section (title + body text).
    Each chunk is prefixed with the section title for context.
    """
    prefix = f"{title}\n\n" if title else ""
    paragraphs = re.split(r'\n{2,}', body)
    chunks = []
    current = prefix

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        # If adding this paragraph keeps us under limit, just append
        if len(current) + len(para) + 2 <= max_size:
            current += para + "\n\n"
        else:
            # Current chunk is full — bank it
            if current.strip() and current.strip() != prefix.strip():
                chunks.append(current.strip())

            # Does the paragraph itself fit? If yes, start new chunk with it
            if len(prefix) + len(para) <= max_size:
                current = prefix + para + "\n\n"
            else:
                # Paragraph is huge — split into sentences with overlap
                sentences = _split_sentences(para)
                current = prefix
                for sent in sentences:
                    if len(current) + len(sent) + 1 <= max_size:
                        current += sent + " "
                    else:
                        if current.strip() and current.strip() != prefix.strip():
                            chunks.append(current.strip())
                        # Overlap: carry the last `overlap` characters forward
                        tail = current[-overlap:] if overlap < len(current) else current
                        current = prefix + tail.lstrip() + sent + " "
                current += "\n\n"

    if current.strip() and current.strip() != prefix.strip():
        chunks.append(current.strip())

    return chunks


def chunk_text(
    text: str,
    max_chunk_size: int = 1000,
    overlap: int = 200,
) -> list[str]:
    """
    Semantically chunk text for RAG.

    Args:
        text:           Raw document text.
        max_chunk_size: Max characters per chunk (default 1000 ≈ ~200 tokens).
        overlap:        Overlap between consecutive chunks (default 200 chars).

    Returns:
        List of text chunks, each ≤ max_chunk_size characters.
    """
    if not text or not text.strip():
        return []

    # ── Step 1: split on markdown headers (## Heading / ### Sub) ──
    # Pattern: any line starting with one or more # chars
    header_pattern = re.compile(r'^(#{1,3})\s+(.+)$', re.MULTILINE)
    matches = list(header_pattern.finditer(text))

    if not matches:
        # No headers — treat entire text as one section
        return _chunk_section("", text, max_chunk_size, overlap)

    chunks = []

    # Text before the first header
    preamble = text[:matches[0].start()].strip()
    if preamble:
        chunks.extend(_chunk_section("", preamble, max_chunk_size, overlap))

    for i, match in enumerate(matches):
        title = match.group(0).strip()   # e.g. "## Neural Networks"
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end].strip()

        if body:
            chunks.extend(_chunk_section(title, body, max_chunk_size, overlap))

    # Deduplicate while preserving order
    seen = set()
    deduped = []
    for c in chunks:
        key = c[:120]  # first 120 chars as fingerprint
        if key not in seen:
            seen.add(key)
            deduped.append(c)

    return deduped