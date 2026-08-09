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
    op.add_column('document_chunks', sa.Column('embedding_vec', Vector(3072), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('document_chunks', 'embedding_vec')
