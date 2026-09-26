"""Build knowledge-base rows from the curated JSON files in app/knowledge/.

Weekdays and weekend notes are computed here, so the data files only carry verified dates.
"""

import json
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import KnowledgeEntry, KnowledgeKeyword

DATA_DIR = Path(__file__).resolve().parent.parent / "knowledge"


@dataclass
class EntryData:
    kind: str
    title: str
    content: str
    keywords: list[str]
    source: str
    year: int | None = None


def _long(value: date) -> str:
    return f"{value.strftime('%A')} {value.day} {value.strftime('%B %Y')}"


def _range(start: date, end: date) -> str:
    return f"{_long(start)} to {_long(end)} ({start.isoformat()} to {end.isoformat()})"


def weekend_note(day: date) -> str:
    """How a single holiday sits relative to the surrounding weekend."""
    weekday = day.weekday()  # Monday=0 .. Sunday=6
    if weekday == 5:
        return f"Falls on a weekend: {_range(day, day + timedelta(days=1))}."
    if weekday == 6:
        return f"Falls on a weekend: {_range(day - timedelta(days=1), day)}."
    if weekday == 4:
        return f"Long weekend: {_range(day, day + timedelta(days=2))}."
    if weekday == 0:
        return f"Long weekend: {_range(day - timedelta(days=2), day)}."
    if weekday == 3:
        return f"With the Friday off: {_range(day, day + timedelta(days=3))}."
    if weekday == 1:
        return f"With the Monday off: {_range(day - timedelta(days=3), day)}."
    return "Mid-week (Wednesday)."


def holiday_content(name: str, dates: list[date], tentative: bool) -> str:
    year = dates[0].year
    if len(dates) == 1:
        day = dates[0]
        text = f"{name} {year}: {_long(day)} ({day.isoformat()}). {weekend_note(day)}"
    else:
        options = " or ".join(f"{_long(d)} ({d.isoformat()})" for d in dates)
        text = f"{name} {year}: {options}; published lists differ."
    if tentative:
        text += " The date depends on moon sighting and may shift by a day; confirm with the user."
    return text


def _load(name: str) -> dict:
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


def build_entries() -> list[EntryData]:
    entries: list[EntryData] = []
    for item in _load("holidays.json")["holidays"]:
        dates = [date.fromisoformat(d) for d in item["dates"]]
        if any(d.year != item["year"] for d in dates):
            raise ValueError(f"{item['name']}: dates do not match year {item['year']}")
        entries.append(
            EntryData(
                kind="holiday",
                title=f"{item['name']} {item['year']}",
                content=holiday_content(item["name"], dates, item["tentative"]),
                keywords=item["keywords"],
                source=item["source"],
                year=item["year"],
            )
        )
    for item in _load("destinations.json")["destinations"]:
        variants = ", ".join(item["keywords"])
        entries.append(
            EntryData(
                kind="destination",
                title=item["name"],
                content=(
                    f"{variants} = {item['name']} (the same place). "
                    "Keep the destination exactly as the user wrote it."
                ),
                keywords=item["keywords"],
                source="Curated alternative place names",
            )
        )
    for item in _load("phrases.json")["phrases"]:
        entries.append(
            EntryData(
                kind="phrase",
                title=item["title"],
                content=item["content"],
                keywords=item["keywords"],
                source="Curated Hinglish phrase notes",
            )
        )
    return entries


def replace_knowledge(db: Session, entries: list[EntryData]) -> int:
    """Replace the whole knowledge base in one transaction (idempotent)."""
    db.execute(delete(KnowledgeEntry))
    for data in entries:
        keywords = sorted({k.strip().lower() for k in data.keywords if k.strip()})
        db.add(
            KnowledgeEntry(
                kind=data.kind,
                title=data.title,
                content=data.content,
                year=data.year,
                source=data.source,
                keywords=[KnowledgeKeyword(keyword=k) for k in keywords],
            )
        )
    db.commit()
    return len(entries)
