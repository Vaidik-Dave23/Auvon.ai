import os
import sys
import logging
import math
from types import ModuleType

# Mock the missing vertexai module to prevent Ragas import crash on startup
mock_vertex = ModuleType('langchain_community.chat_models.vertexai')
mock_vertex.ChatVertexAI = None
sys.modules['langchain_community.chat_models.vertexai'] = mock_vertex

from datasets import Dataset
from ragas import evaluate

# New import style (removes deprecation warnings)
from ragas.metrics import (
    faithfulness,
    answer_relevancy
)

from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from app.database import SessionLocal
from app.models.ai_log import AILog

logger = logging.getLogger(__name__)


def evaluate_response_task(
    log_id: int,
    context: str,
    query: str,
    response: str
):
    """
    Background RAGAS evaluation.

    Metrics:
    - Faithfulness
    - Answer Relevancy

    Pass Criteria:
    - Faithfulness >= 0.8
    """

    api_key = os.getenv("AIPIPE_API_KEY")

    if not api_key:
        logger.error(
            "AIPIPE_API_KEY is not set. Skipping evaluation."
        )
        return

    try:

        logger.info(
            f"Starting evaluation for log ID {log_id}"
        )

        # Dataset expected by current RAGAS version
        data = {
            "question": [query],
            "contexts": [[context]],
            "answer": [response]
        }

        dataset = Dataset.from_dict(data)

        eval_llm = ChatOpenAI(
            model="openai/gpt-4o-mini",
            openai_api_key=api_key,
            openai_api_base="https://aipipe.org/openrouter/v1"
        )

        eval_embeddings = OpenAIEmbeddings(
            model="text-embedding-3-small",
            openai_api_key=api_key,
            openai_api_base="https://aipipe.org/openai/v1"
        )

        logger.info(
            f"Running RAGAS evaluation for log ID {log_id}..."
        )

        result = evaluate(
            dataset=dataset,
            metrics=[
                faithfulness,
                answer_relevancy
            ],
            llm=eval_llm,
            embeddings=eval_embeddings
        )

        scores_dict = (
            result.scores[0]
            if result.scores
            else {}
        )

        faithfulness_score = scores_dict.get(
            "faithfulness",
            0.0
        )

        relevance_score = scores_dict.get(
            "answer_relevancy",
            0.0
        )

        # Handle NaN values
        if math.isnan(faithfulness_score):
            faithfulness_score = 0.0

        if math.isnan(relevance_score):
            relevance_score = 0.0

        logger.info(
            f"Evaluation results for log {log_id}: "
            f"faith={faithfulness_score:.4f}, "
            f"relevance={relevance_score:.4f}"
        )

        is_faithful_enough = (
            faithfulness_score >= 0.8
        )

        status_msg = (
            "PASSED"
            if is_faithful_enough
            else "FAILED"
        )

        feedback = (
            f"RAGAS evaluation completed. "
            f"Faithfulness: {faithfulness_score * 100:.1f}% "
            f"({status_msg} - Target: >= 80%). "
            f"Answer Relevancy: {relevance_score * 100:.1f}%."
        )

        if not is_faithful_enough:
            logger.warning(
                f"Faithfulness FAILED for log ID {log_id}: "
                f"{faithfulness_score * 100:.1f}%"
            )
        else:
            logger.info(
                f"Faithfulness PASSED for log ID {log_id}: "
                f"{faithfulness_score * 100:.1f}%"
            )

        db = SessionLocal()

        try:

            log_record = (
                db.query(AILog)
                .filter(AILog.id == log_id)
                .first()
            )

            if log_record:

                log_record.faithfulness = float(
                    faithfulness_score
                )

                log_record.relevance = float(
                    relevance_score
                )

                log_record.evaluation_feedback = (
                    feedback
                )

                db.commit()

                logger.info(
                    f"Background evaluation updated "
                    f"for log ID {log_id}"
                )

        finally:
            db.close()

    except Exception as e:

        logger.exception(
            f"Evaluation failed for log ID {log_id}: {e}"
        )