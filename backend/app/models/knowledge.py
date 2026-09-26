import uuid

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class KnowledgeEntry(Base):
    """A curated reference note retrieved into the AI prompt (AI-spec.md, Reference Knowledge)."""

    __tablename__ = "knowledge_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # holiday|destination|phrase
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(300), nullable=False)

    keywords: Mapped[list["KnowledgeKeyword"]] = relationship(
        back_populates="entry", cascade="all, delete-orphan", passive_deletes=True
    )


class KnowledgeKeyword(Base):
    """A lowercase search phrase for an entry, matched with pg_trgm strict word similarity.

    No trigram index: the keyword is compared against the whole user text, a direction a
    GIN index cannot serve, and a sequential scan over a few hundred rows is ~1 ms.
    """

    __tablename__ = "knowledge_keywords"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    entry_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("knowledge_entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    keyword: Mapped[str] = mapped_column(String(100), nullable=False)

    entry: Mapped[KnowledgeEntry] = relationship(back_populates="keywords")
