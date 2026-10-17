import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Tests use a throwaway database and the real synthetic cohort + artifacts.
os.environ.setdefault("PRATIBIMB_DB", str(ROOT / "test_pratibimb.db"))
os.environ.setdefault("PRATIBIMB_DEMO_SPEED", "1000")


@pytest.fixture(scope="session")
def cohort():
    from twin.engine.cohort import Cohort
    return Cohort()


@pytest.fixture(scope="session", autouse=True)
def _cleanup_db():
    yield
    for suffix in ("", "-journal", "-wal", "-shm"):
        p = Path(os.environ["PRATIBIMB_DB"] + suffix)
        if p.exists():
            p.unlink()
