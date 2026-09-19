"""add pgvector column and hnsw index to document_chunks

Revision ID: 1aad5de4e7d3
Revises:
Create Date: 2026-08-09 22:50:04.944775

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1aad5de4e7d3'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    from pgvector.sqlalchemy import Vector

    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.add_column('document_chunks', sa.Column('embedding_vec', Vector(3072), nullable=True))

    # NOTE: HNSW build cost/memory scales with dimension (3072 here), and
    # pgvector indexes cap at 2000 dims for the default build path in older
    # pgvector versions (<0.7.0). Use PL/pgSQL to catch exception gracefully.
    op.execute(
        """
        DO $$
        BEGIN
            BEGIN
                CREATE INDEX IF NOT EXISTS ix_document_chunks_embedding_vec_hnsw 
                ON document_chunks USING hnsw (embedding_vec vector_cosine_ops);
            EXCEPTION WHEN others THEN
                RAISE NOTICE 'HNSW index skipped due to dimension limit or unsupported pgvector version: %', SQLERRM;
            END;
        END $$;
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding_vec_hnsw")
    op.drop_column('document_chunks', 'embedding_vec')
