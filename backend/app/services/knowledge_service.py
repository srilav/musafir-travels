"""Keyword retrieval of reference notes for the AI prompt (RAG without embeddings).

Uses pg_trgm strict word similarity so misspellings ("diwaali") still match, while whole-word
boundaries keep "holi" from matching "holiday".
"""

import re
from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

MATCH_THRESHOLD = 0.6
MAX_NOTES = 6
STATEMENT_TIMEOUT_MS = 500

_YEAR = re.compile(r"\b(19\d{2}|20\d{2}|21\d{2})\b")

_SEARCH_SQL = text(
    """
    SELECT e.content, max(strict_word_similarity(k.keyword, :q)) AS score
    FROM knowledge_keywords k
    JOIN knowledge_entries e ON e.id = k.entry_id
    WHERE strict_word_similarity(k.keyword, :q) >= :threshold
      AND (e.year IS NULL OR e.year = ANY(:years))
    GROUP BY e.id, e.content, e.year
    ORDER BY score DESC, e.year NULLS FIRST, e.content
    LIMIT :limit
    """
)


def relevant_years(query: str, reference_date: date) -> list[int]:
    """Years the user wrote; otherwise this year and next (for next-occurrence inference)."""
    explicit = {int(y) for y in _YEAR.findall(query)}
    return sorted(explicit or {reference_date.year, reference_date.year + 1})


class KnowledgeRetriever:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def search(self, query: str, reference_date: date, limit: int = MAX_NOTES) -> list[str]:
        query = query.lower().strip()
        if not query:
            return []
        with self._session_factory() as db, db.begin():
            db.execute(text(f"SET LOCAL statement_timeout = {STATEMENT_TIMEOUT_MS}"))
            rows = db.execute(
                _SEARCH_SQL,
                {
                    "q": query,
                    "threshold": MATCH_THRESHOLD,
                    "years": relevant_years(query, reference_date),
                    "limit": limit,
                },
            )
            return [row.content for row in rows]
