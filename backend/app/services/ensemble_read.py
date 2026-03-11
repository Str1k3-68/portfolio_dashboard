"""Ensemble tag and summary service.

Reads ensemble definitions from ensembles.json and enriches symphony data
with ensemble membership tags and aggregate performance summaries.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

_ENSEMBLES_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "ensembles.json"
)

_cached_config: Optional[dict] = None


def _load_config() -> dict:
    """Load and cache ensemble config from ensembles.json."""
    global _cached_config
    if _cached_config is not None:
        return _cached_config
    path = os.path.normpath(_ENSEMBLES_PATH)
    if not os.path.exists(path):
        logger.warning("ensembles.json not found at %s", path)
        _cached_config = {}
        return _cached_config
    with open(path, "r", encoding="utf-8") as f:
        _cached_config = json.load(f).get("ensembles", {})
    logger.info("Loaded %d ensemble definitions", len(_cached_config))
    return _cached_config


def get_ensemble_tags_for_symphony(symphony_id: str) -> List[dict]:
    """Return list of ensemble tags for a given symphony_id.

    Each tag: {"letter": "C", "name": "Alt C", "color": "#10b981", "weight": 30}
    """
    config = _load_config()
    tags = []
    for letter, ens in config.items():
        symphonies = ens.get("symphonies", {})
        if symphony_id in symphonies:
            entry = symphonies[symphony_id]
            tags.append({
                "letter": letter,
                "name": ens.get("name", f"Alt {letter}"),
                "color": ens.get("color", "#888"),
                "weight": entry.get("weight", 0),
            })
    return tags


def build_ensemble_tag_map() -> Dict[str, List[dict]]:
    """Return {symphony_id: [tags]} for all tagged symphonies."""
    config = _load_config()
    tag_map: Dict[str, List[dict]] = {}
    for letter, ens in config.items():
        for sym_id, entry in ens.get("symphonies", {}).items():
            if sym_id not in tag_map:
                tag_map[sym_id] = []
            tag_map[sym_id].append({
                "letter": letter,
                "name": ens.get("name", f"Alt {letter}"),
                "color": ens.get("color", "#888"),
                "weight": entry.get("weight", 0),
            })
    return tag_map


def get_ensemble_summaries(
    symphonies: List[dict],
) -> List[dict]:
    """Compute ensemble summary cards from live symphony data.

    Args:
        symphonies: List of symphony dicts from the list endpoint
                    (must have id, value, last_percent_change, time_weighted_return)

    Returns:
        List of ensemble summary dicts sorted by letter.
    """
    config = _load_config()
    if not config:
        return []

    # Build lookup: symphony_id → best symphony data (prefer highest value for dedup)
    sym_lookup: Dict[str, dict] = {}
    for s in symphonies:
        sid = s.get("id", "")
        if sid not in sym_lookup or s.get("value", 0) > sym_lookup[sid].get("value", 0):
            sym_lookup[sid] = s

    summaries = []
    for letter in sorted(config.keys()):
        ens = config[letter]
        ens_symphonies = ens.get("symphonies", {})

        components = []
        total_aum = 0.0
        weighted_today = 0.0
        weighted_twr = 0.0
        total_weight_found = 0.0

        for sym_id, entry in ens_symphonies.items():
            weight = entry.get("weight", 0) / 100.0
            sym_data = sym_lookup.get(sym_id)

            if sym_data:
                value = sym_data.get("value", 0)
                today_ret = sym_data.get("last_percent_change", 0)
                twr = sym_data.get("time_weighted_return", 0)
                total_aum += value
                weighted_today += today_ret * weight
                weighted_twr += twr * weight
                total_weight_found += weight

                components.append({
                    "symphony_id": sym_id,
                    "label": entry.get("label", sym_data.get("name", sym_id[:12])),
                    "weight": entry.get("weight", 0),
                    "value": round(value, 2),
                    "today_return_pct": round(today_ret, 2),
                    "twr": round(twr, 2),
                })
            else:
                components.append({
                    "symphony_id": sym_id,
                    "label": entry.get("label", sym_id[:12]),
                    "weight": entry.get("weight", 0),
                    "value": 0.0,
                    "today_return_pct": 0.0,
                    "twr": 0.0,
                })

        summaries.append({
            "letter": letter,
            "name": ens.get("name", f"Alt {letter}"),
            "color": ens.get("color", "#888"),
            "total_aum": round(total_aum, 2),
            "weighted_today_return": round(weighted_today, 2),
            "weighted_twr": round(weighted_twr, 2),
            "component_count": len(ens_symphonies),
            "components": components,
        })

    return summaries


def reload_config():
    """Force reload of ensemble config (e.g. after editing ensembles.json)."""
    global _cached_config
    _cached_config = None
    _load_config()
