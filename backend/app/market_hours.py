"""US equity market hours utilities (Eastern Time).

Uses ``exchange_calendars`` (XNYS) for holiday and early-close awareness.
Falls back to weekday-only logic when the library is unavailable.
"""

from datetime import datetime, date, timedelta, time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import logging

logger = logging.getLogger(__name__)

try:
    ET = ZoneInfo("America/New_York")
except ZoneInfoNotFoundError as e:
    # Windows may not have IANA timezone data available by default.
    # The 'tzdata' PyPI package provides it and is included in requirements.txt,
    # but keep a clear error here in case a user is running an incomplete env.
    raise RuntimeError(
        "Timezone data not found for 'America/New_York'. "
        "On Windows, ensure the 'tzdata' package is installed "
        "(python -m pip install tzdata), then retry."
    ) from e

MARKET_OPEN = time(9, 30)
MARKET_CLOSE = time(16, 0)
MARKET_CLOSE_BUFFER = time(16, 5)  # +5 min buffer for data delays

# ---------------------------------------------------------------------------
# NYSE calendar (holiday + early-close aware)
# ---------------------------------------------------------------------------
try:
    import exchange_calendars as _ec
    _NYSE_CAL = _ec.get_calendar("XNYS")
    _HAS_CALENDAR = True
    logger.debug("exchange_calendars loaded — holiday-aware market hours active")
except ImportError:
    _NYSE_CAL = None
    _HAS_CALENDAR = False
    logger.warning(
        "exchange_calendars not installed — falling back to weekday-only market hours. "
        "Install with: pip install exchange-calendars"
    )


def now_et() -> datetime:
    """Current datetime in US Eastern."""
    return datetime.now(ET)


def is_trading_day(d: date) -> bool:
    """True if *d* is an NYSE trading session (excludes weekends AND holidays).

    Falls back to weekday-only check when exchange_calendars is unavailable.
    """
    if _HAS_CALENDAR:
        try:
            return _NYSE_CAL.is_session(d.isoformat())
        except Exception:
            pass
    return d.weekday() < 5


def is_weekday(d: date) -> bool:
    """Backward-compatible alias; prefer ``is_trading_day`` for accuracy."""
    return is_trading_day(d)


def is_early_close(d: date) -> bool:
    """True if *d* is an NYSE early-close day (1:00 PM ET close)."""
    if not _HAS_CALENDAR:
        return False
    try:
        import pandas as pd
        ts = pd.Timestamp(d)
        return ts in _NYSE_CAL.early_closes
    except Exception:
        return False


def get_close_time(d: date) -> time:
    """Return the market close time for *d* (1:00 PM on early-close days)."""
    if is_early_close(d):
        return time(13, 0)
    return MARKET_CLOSE


def is_market_open() -> bool:
    """True during regular trading hours (9:30 AM – close ET, trading days).

    Respects NYSE holidays and early-close days.
    """
    dt = now_et()
    today = dt.date()
    if not is_trading_day(today):
        return False
    t = dt.time()
    close = get_close_time(today)
    return MARKET_OPEN <= t < close


def is_within_trading_session() -> bool:
    """True during market hours + 5 min buffer (9:30 AM – close+5min ET, trading days).

    Respects NYSE holidays and early-close days.
    Use this to gate auto-refresh calls that should only run while the
    market is open or just after close (to capture final data).
    """
    dt = now_et()
    today = dt.date()
    if not is_trading_day(today):
        return False
    t = dt.time()
    close = get_close_time(today)
    # 5 min buffer after close
    close_buffer = time(close.hour, close.minute + 5) if close.minute < 55 else time(close.hour + 1, (close.minute + 5) % 60)
    return MARKET_OPEN <= t < close_buffer


def is_after_close() -> bool:
    """True between market close and next market open.

    Respects NYSE holidays and early-close days.
    This is the window for post-close tasks like allocation snapshots.
    """
    dt = now_et()
    today = dt.date()
    if not is_trading_day(today):
        return False  # weekends/holidays handled separately
    t = dt.time()
    close = get_close_time(today)
    return t >= close or t < MARKET_OPEN


def get_allocation_target_date() -> date:
    """Determine the effective trading date for allocation snapshots.

    Rules:
    - Between 4:00 PM and midnight ET → next calendar day
    - Between midnight and 9:30 AM ET → same calendar day (today)
    - If the target falls on a weekend, roll forward to Monday.

    Returns None if called during market hours (allocations shouldn't
    be captured then).
    """
    dt = now_et()
    t = dt.time()
    today = dt.date()

    if t >= MARKET_CLOSE:
        # After close → target is next calendar day
        target = today + timedelta(days=1)
    elif t < MARKET_OPEN:
        # Before open → target is today
        target = today
    else:
        # During market hours — not the right time for allocations
        return None

    # Roll forward past weekends and holidays
    while not is_trading_day(target):
        target += timedelta(days=1)

    return target


def next_trading_day(d: date = None) -> date:
    """Return the next trading day after the given date (skips weekends AND holidays)."""
    if d is None:
        d = now_et().date()
    d = d + timedelta(days=1)
    while not is_trading_day(d):
        d += timedelta(days=1)
    return d


def previous_trading_day(d: date = None) -> date:
    """Return the most recent trading day before *d* (skips weekends AND holidays)."""
    if d is None:
        d = now_et().date()
    d = d - timedelta(days=1)
    while not is_trading_day(d):
        d -= timedelta(days=1)
    return d
