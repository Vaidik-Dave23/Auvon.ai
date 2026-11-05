"""Retrieval helpers shared by /notes/{id}/query and benchmarks/run.py."""
from app.routes.notes import (
    NOT_COVERED_REPLY,
    build_context,
    build_qa_prompt,
    rank_chunks,
    select_context_chunks,
)


def test_rank_chunks_orders_by_cosine_and_skips_unembedded():
    chunks = [
        {"chunk_text": "far", "embedding": [0.0, 1.0]},
        {"chunk_text": "near", "embedding": [1.0, 0.1]},
        {"chunk_text": "no vector"},
    ]
    scored = rank_chunks([1.0, 0.0], chunks)
    assert [t for _, t in scored] == ["near", "far"]


def test_context_keeps_up_to_six_above_threshold_else_best_three():
    strong = [(0.9 - i * 0.05, f"s{i}") for i in range(8)]
    assert [t for _, t in select_context_chunks(strong)] == [f"s{i}" for i in range(6)]
    weak = [(0.2, "a"), (0.1, "b"), (0.05, "c"), (0.01, "d")]
    assert [t for _, t in select_context_chunks(weak)] == ["a", "b", "c"]


def test_prompt_numbers_sources_and_carries_the_refusal_line():
    ctx = build_context([(0.81, "alpha"), (0.5, "beta")])
    assert ctx.startswith("[Source 1 — relevance 81%]\nalpha") and "[Source 2 — relevance 50%]\nbeta" in ctx
    prompt = build_qa_prompt(ctx, "what is alpha?")
    assert NOT_COVERED_REPLY in prompt[0]["content"]
    assert "QUESTION: what is alpha?" in prompt[1]["content"] and ctx in prompt[1]["content"]
