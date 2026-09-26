"""knowledge base for AI reference notes (pg_trgm keyword search)

Revision ID: 0002_knowledge_base
Revises: 0001_initial
Create Date: 2026-09-25
"""

import sqlalchemy as sa

from alembic import op

revision = "0002_knowledge_base"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # pg_trgm is a trusted extension (PG 13+): the database owner can create it, incl. on RDS.
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.create_table(
        "knowledge_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("source", sa.String(length=300), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_knowledge_entries_year", "knowledge_entries", ["year"])
    op.create_table(
        "knowledge_keywords",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entry_id", sa.Uuid(), nullable=False),
        sa.Column("keyword", sa.String(length=100), nullable=False),
        sa.ForeignKeyConstraint(["entry_id"], ["knowledge_entries.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_knowledge_keywords_entry_id", "knowledge_keywords", ["entry_id"])


def downgrade() -> None:
    op.drop_table("knowledge_keywords")
    op.drop_table("knowledge_entries")
    # The extension is left installed: other objects may depend on it.
