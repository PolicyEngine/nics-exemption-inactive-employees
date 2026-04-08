import pandas as pd

from nics_exemption.lfs import build_lfs_transition_targets


def test_build_lfs_transition_targets_requires_active_after_final_inactivity():
    lfs = pd.DataFrame(
        {
            "INCAC051": [1, 6, 6, 1],
            "INCAC052": [6, 6, 1, 1],
            "INCAC053": [6, 1, 6, 1],
            "INCAC054": [6, 1, 1, 1],
            "INCAC055": [6, 1, 6, 1],
        }
    )

    targets = build_lfs_transition_targets(lfs)

    assert targets["was_inactive_at_some_point"].tolist() == [
        True,
        True,
        True,
        False,
    ]
    assert targets["became_active_afterwards"].tolist() == [
        False,
        True,
        False,
        False,
    ]
    assert targets["joined_labour_force_recently"].tolist() == [
        False,
        True,
        False,
        False,
    ]
