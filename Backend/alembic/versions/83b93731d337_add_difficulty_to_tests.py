"""add difficulty column to tests

Revision ID: 83b93731d337
Revises: 1aad5de4e7d3
Create Date: 2026-08-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '83b93731d337'
down_revision: Union[str, Sequence[str], None] = '1aad5de4e7d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'tests',
        sa.Column('difficulty', sa.String(), nullable=False, server_default='easy')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('tests', 'difficulty')
