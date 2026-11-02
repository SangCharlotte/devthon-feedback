"""
Sliding Window Rate Limiter Engine.
Provides memory-efficient, thread-safe request tracking bounds across a sliding temporal interval
to mitigate automated brute-force authentication subversion vectors.
"""

import math
import threading
import time
from collections import deque


class FailureLimiter:
    def __init__(self, limit: int, window_seconds: float, clock=time.monotonic):
        self.limit = limit
        self.window = window_seconds
        self._clock = clock  # Injectable clock provider reference to facilitate deterministic unit testing simulations
        self._failures: dict[str, deque[float]] = {}
        # Mitigate race conditions arising from concurrent FastAPI worker execution pool contexts
        self._lock = threading.Lock()

    def _recent(self, key: str, now: float) -> deque[float]:
        times = self._failures.get(key, deque())
        while times and times[0] <= now - self.window:
            times.popleft()
        if times:
            self._failures[key] = times
        else:
            self._failures.pop(key, None)  # Clean up empty tracking keys to optimize resource utilization
        return times

    def retry_after(self, key: str) -> int:
        """Seconds until `key` may try again; 0 means it isn't blocked."""
        with self._lock:
            now = self._clock()
            times = self._recent(key, now)
            if len(times) < self.limit:
                return 0
            # Blocked until enough old failures fall out of the window.
            return max(1, math.ceil(times[-self.limit] + self.window - now))

    def record_failure(self, key: str) -> None:
        with self._lock:
            now = self._clock()
            self._recent(key, now)
            self._failures.setdefault(key, deque()).append(now)
            if len(self._failures) > 10_000:
                # Many different keys (e.g. an attack from many IPs): drop the expired ones.
                for stale in list(self._failures):
                    self._recent(stale, now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._failures.clear()
