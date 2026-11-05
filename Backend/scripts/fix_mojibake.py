"""
One-off repair for text saved while streaming decoded UTF-8 as Latin-1
(emoji and symbols became things like "ðŸ“˜" or "â€”").

Fixes: notes.content, tutor_sessions message contents.
Deletes document_chunks of repaired notes, so their embeddings are rebuilt
from the clean text the next time someone asks a question about the note.

Run from the Backend folder (uses MONGODB_URI from .env):
    python -m scripts.fix_mojibake            # dry run: only shows what would change
    python -m scripts.fix_mojibake --apply    # writes the fixes
"""
import sys

MARKERS = ("Ã", "â€", "ð\x9f", "Â")


def repair(text):
    """Undo UTF-8-read-as-Latin-1. Leaves text alone if it doesn't look broken
    or can't be reversed cleanly."""
    if not isinstance(text, str) or not any(m in text for m in MARKERS):
        return text
    try:
        fixed = text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text
    return fixed


def main(apply: bool) -> None:
    from app.database import notes_col, document_chunks_col, tutor_sessions_col

    note_ids = []
    for note in notes_col.find({}, {"content": 1, "title": 1}):
        fixed = repair(note.get("content"))
        if fixed != note.get("content"):
            note_ids.append(str(note["_id"]))
            print(f"note  {note['_id']}  {note.get('title', '')[:50]}")
            if apply:
                notes_col.update_one({"_id": note["_id"]}, {"$set": {"content": fixed}})
                document_chunks_col.delete_many({"note_id": str(note["_id"])})

    sessions = 0
    for sess in tutor_sessions_col.find({}, {"messages": 1}):
        msgs = sess.get("messages") or []
        changed = False
        for m in msgs:
            fixed = repair(m.get("content"))
            if fixed != m.get("content"):
                m["content"] = fixed
                changed = True
        if changed:
            sessions += 1
            if apply:
                tutor_sessions_col.update_one({"_id": sess["_id"]}, {"$set": {"messages": msgs}})

    mode = "Fixed" if apply else "Would fix"
    print(f"\n{mode}: {len(note_ids)} note(s), {sessions} tutor session(s).")
    if not apply:
        print("Dry run only. Re-run with --apply to write the changes.")


if __name__ == "__main__":
    main(apply="--apply" in sys.argv)
