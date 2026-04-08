"""Labour Force Survey preparation helpers."""

from __future__ import annotations

import numpy as np
import pandas as pd


LFS_INACTIVITY_COLS = ["INCAC051", "INCAC052", "INCAC053", "INCAC054", "INCAC055"]


def build_lfs_transition_targets(
    lfs: pd.DataFrame,
    inactivity_cols: list[str] | None = None,
) -> pd.DataFrame:
    """Build ordered inactivity-to-activity targets from 5-quarter LFS data.

    A person is counted as becoming active after inactivity only if they have
    an active observation after their final inactive observation in the panel.
    """
    cols = inactivity_cols or LFS_INACTIVITY_COLS
    status = lfs[cols].to_numpy()
    inactive = status >= 6
    active = status == 1

    was_inactive = inactive.any(axis=1)
    last_inactive_quarter = np.full(len(lfs), -1, dtype=int)
    if len(lfs):
        last_inactive_quarter = np.where(
            was_inactive,
            inactive.shape[1] - 1 - np.argmax(inactive[:, ::-1], axis=1),
            -1,
        )

    became_active_afterwards = np.zeros(len(lfs), dtype=bool)
    activity_length_after_inactivity = np.zeros(len(lfs), dtype=float)
    for row_idx, last_q in enumerate(last_inactive_quarter):
        if last_q < 0 or last_q >= active.shape[1] - 1:
            continue
        later_active = active[row_idx, last_q + 1 :]
        became_active_afterwards[row_idx] = bool(later_active.any())
        if became_active_afterwards[row_idx]:
            activity_length_after_inactivity[row_idx] = (
                active.shape[1] - last_q - 1
            ) / (active.shape[1] - 1)

    return pd.DataFrame(
        {
            "was_inactive_at_some_point": was_inactive,
            "became_active_afterwards": became_active_afterwards,
            "joined_labour_force_recently": (
                was_inactive & became_active_afterwards
            ),
            "activity_length_after_inactivity": activity_length_after_inactivity,
        },
        index=lfs.index,
    )
