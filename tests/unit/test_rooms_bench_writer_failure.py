"""A failed background writer must invalidate the contended room measurement."""

import threading
from pathlib import Path

import pytest

from bench import rooms


@pytest.mark.parametrize("failure", [OSError("write failed"), SystemExit(0)])
def test_contended_writer_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failure: BaseException
) -> None:
    entered = threading.Event()

    def write(*args: object) -> None:
        entered.set()
        raise failure

    def measure(*args: object) -> dict[str, float]:
        assert entered.wait(5)
        return {"median": 0.001, "min": 0.001, "max": 0.001}

    monkeypatch.setattr(rooms.store, "_write_record", write)
    monkeypatch.setattr(rooms, "arm", measure)
    # On the broken base the deliberately injected exception reaches the thread hook.
    monkeypatch.setattr(threading, "excepthook", lambda args: None)
    with pytest.raises(RuntimeError, match="contended room writer failed") as error:
        rooms.contended(tmp_path, 1, 1, 1, 1)
    assert error.value.__cause__ is failure


def test_contended_healthy_writer(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    entered = threading.Event()
    timing = {"median": 0.001, "min": 0.001, "max": 0.001}

    def write(*args: object) -> None:
        entered.set()

    def measure(*args: object) -> dict[str, float]:
        assert entered.wait(5)
        return timing

    monkeypatch.setattr(rooms.store, "_write_record", write)
    monkeypatch.setattr(rooms, "arm", measure)
    assert rooms.contended(tmp_path, 1, 1, 1, 1) == timing
