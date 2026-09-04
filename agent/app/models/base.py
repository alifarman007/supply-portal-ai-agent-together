"""SQLAlchemy foundation.

Conventions (PLAN.md §5, §13):
- Money columns are integer paisa, named *_paisa.
- Exact non-money quantities (qty) use DecimalText (TEXT-backed Decimal) —
  SQLite NUMERIC would round-trip through float.
- Greenfield DB: `init_db` (create_all) stands in for migrations; Alembic is
  not on the approved dependency list (see CLAUDE.md assumptions).
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import String, TypeDecorator, create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings


class Base(DeclarativeBase):
    pass


class DecimalText(TypeDecorator):
    """Exact Decimal stored as TEXT. Never used for money (money = integer paisa)."""

    impl = String(40)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, float):
            raise TypeError("float is not allowed for exact quantities")
        return str(Decimal(value))

    def process_result_value(self, value, dialect):
        return None if value is None else Decimal(value)


def make_engine(url: str | None = None) -> Engine:
    url = url or get_settings().app_db_url
    kwargs: dict = {}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        if url in ("sqlite://", "sqlite:///:memory:"):
            kwargs["poolclass"] = StaticPool
    return create_engine(url, **kwargs)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)


def init_db(engine: Engine) -> None:
    import app.models  # noqa: F401  — ensure every table is registered

    Base.metadata.create_all(engine)
