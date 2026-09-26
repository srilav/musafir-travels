"""Knowledge base: data building, loading, and pg_trgm keyword retrieval."""

from datetime import date

import pytest
from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import KnowledgeEntry, KnowledgeKeyword
from app.services.knowledge_loader import (
    EntryData,
    build_entries,
    holiday_content,
    replace_knowledge,
    weekend_note,
)
from app.services.knowledge_service import KnowledgeRetriever, relevant_years

REF = date(2026, 9, 25)


@pytest.mark.parametrize(
    ("day", "expected"),
    [
        (date(2026, 11, 8), "Falls on a weekend: Saturday 7 November 2026 to Sunday 8"),  # Sun
        (date(2027, 10, 2), "Falls on a weekend: Saturday 2 October 2027 to Sunday 3"),  # Sat
        (date(2027, 10, 29), "Long weekend: Friday 29 October 2027 to Sunday 31"),  # Fri
        (date(2026, 1, 26), "Long weekend: Saturday 24 January 2026 to Monday 26"),  # Mon
        (date(2026, 1, 1), "With the Friday off: Thursday 1 January 2026 to Sunday 4"),  # Thu
        (date(2027, 1, 26), "With the Monday off: Saturday 23 January 2027 to Tuesday 26"),  # Tue
        (date(2026, 3, 4), "Mid-week (Wednesday)."),  # Wed
    ],
)
def test_weekend_note(day, expected):
    assert weekend_note(day).startswith(expected)


def test_holiday_content_tentative_and_alternatives():
    text = holiday_content("Bakrid", [date(2026, 5, 27), date(2026, 5, 28)], tentative=True)
    assert "2026-05-27" in text and "2026-05-28" in text
    assert "moon sighting" in text


def test_bundled_data_is_consistent():
    entries = build_entries()
    kinds = {e.kind for e in entries}
    assert kinds == {"holiday", "destination", "phrase"}
    diwali = [e for e in entries if e.title.startswith("Diwali")]
    assert {e.year for e in diwali} == {2026, 2027}
    assert any("2026-11-08" in e.content for e in diwali)
    for entry in entries:
        assert entry.keywords, entry.title
        assert entry.source
        # Date-shaped keywords would match any trip in that month.
        assert not any(k[0].isdigit() for k in entry.keywords), entry.title


def _load(entries):
    with SessionLocal() as db:
        return replace_knowledge(db, entries)


def test_replace_knowledge_is_idempotent():
    entries = build_entries()
    _load(entries)
    _load(entries)
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(KnowledgeEntry)) == len(entries)
        keywords = list(db.scalars(select(KnowledgeKeyword.keyword)))
    assert all(k == k.lower().strip() for k in keywords)


@pytest.fixture
def retriever():
    _load(build_entries())
    return KnowledgeRetriever(SessionLocal)


def test_festival_match_including_misspelling(retriever):
    for query in ("Goa for Diwali weekend with friends", "diwaali pe goa"):
        notes = retriever.search(query, REF)
        assert any("2026-11-08" in n for n in notes), query
        assert any("2027-10-29" in n for n in notes), query


def test_whole_word_matching(retriever):
    assert retriever.search("holiday in goa with friends", REF) == []
    assert not any("kal" in n for n in retriever.search("kalyan se goa", REF))


def test_explicit_year_restricts_holidays(retriever):
    notes = retriever.search("Holi 2027 in Mathura", REF)
    assert notes and all("2027" in n for n in notes)
    assert retriever.search("Holi 2029 in Mathura", REF) == []


def test_phrases_and_destinations(retriever):
    assert any("does NOT establish couple" in n for n in retriever.search("hum dono", REF))
    assert any("Puducherry" in n for n in retriever.search("Pondy with friends", REF))
    notes = retriever.search("goa teen raat dosto ke saath", REF)
    assert any("N nights" in n for n in notes)
    assert any("group_of_friends" in n for n in notes)
    assert not any("couple" in n and "trip_type couple" in n for n in notes)


def test_no_noise_for_plain_requests(retriever):
    assert retriever.search("Kyoto, Japan, October 1–3, 2027, with my spouse", REF) == []
    assert retriever.search("Goa from 03/04/2027 to 05/04/2027 with friends", REF) == []
    assert retriever.search("   ", REF) == []


def test_limit(retriever):
    _load([EntryData("phrase", f"t{i}", f"note {i}", ["zebra"], "test") for i in range(10)])
    assert len(retriever.search("zebra", REF, limit=3)) == 3


def test_relevant_years():
    assert relevant_years("goa diwali", REF) == [2026, 2027]
    assert relevant_years("goa diwali 2028", REF) == [2028]
