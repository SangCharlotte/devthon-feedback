"""Counts failed logins so a password can't be guessed by trying thousands of times.

A sliding window: we remember the time of each failure and forget it after
`window` seconds. Once a key (an IP address, a username) has `limit` failures
inside the window, it is blocked until the oldest one expires.

Kept in memory: simple and fast for our single backend process. It resets when
the backend restarts, and several backend copies would each keep their own
count - at that scale it would move to a shared store such as Redis.
"""

import math
import threading
import time
from collections import deque


class FailureLimiter:
    def __init__(self, limit: int, window_seconds: float, clock=time.monotonic):
        self.limit = limit
        self.window = window_seconds
        self._clock = clock  # swappable, so tests can move time forward
        self._failures: dict[str, deque[float]] = {}
        # FastAPI runs normal `def` endpoints in a thread pool: two logins can
        # arrive at once, so the dict is only touched while holding the lock.
        self._lock = threading.Lock()

    def _recent(self, key: str, now: float) -> deque[float]:
        times = self._failures.get(key, deque())
        while times and times[0] <= now - self.window:
            times.popleft()
        if times:
            self._failures[key] = times
        else:
            self._failures.pop(key, None)  # don't keep empty entries around forever
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
