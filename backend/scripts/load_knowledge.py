"""Load (replace) the AI reference knowledge base from app/knowledge/*.json.

    python -m scripts.load_knowledge

Idempotent; run after `alembic upgrade head` (docker compose and the deploy workflow do this).
"""

from app.db import SessionLocal
from app.services.knowledge_loader import build_entries, replace_knowledge


def main() -> None:
    entries = build_entries()
    with SessionLocal() as db:
        count = replace_knowledge(db, entries)
    print(f"Loaded {count} knowledge entries.")


if __name__ == "__main__":
    main()
