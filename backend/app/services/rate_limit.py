import math
import threading
import time
from collections import defaultdict, deque


class SlidingWindowRateLimiter:
    """In-memory, per-process limiter (backend-spec.md §11: an MVP throttle, not a spending cap).

    Counts reset on restart and are not shared between processes or ECS tasks.
    """

    def __init__(self, limit: int, window_seconds: float, clock=time.monotonic) -> None:
        self.limit = limit
        self.window = window_seconds
        self._clock = clock
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str) -> int | None:
        """Record a request. Returns None if allowed, else whole seconds until retry."""
        now = self._clock()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] >= self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return max(1, math.ceil(self.window - (now - hits[0])))
            hits.append(now)
            return None

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
