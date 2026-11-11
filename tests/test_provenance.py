"""Version records the pipeline writes into the results JSON."""

import importlib.metadata
import json

from nics_exemption.provenance import RUN_PACKAGES, installed_versions


def test_installed_versions_reads_package_metadata():
    versions = installed_versions(["pytest", "numpy"])
    assert versions == {
        "pytest": importlib.metadata.version("pytest"),
        "numpy": importlib.metadata.version("numpy"),
    }


def test_missing_distribution_records_none():
    assert installed_versions(["no-such-distribution-nics"]) == {"no-such-distribution-nics": None}


def test_default_record_covers_the_model_and_serialises():
    versions = installed_versions()
    assert list(versions) == list(RUN_PACKAGES)
    assert "policyengine-uk" in versions
    assert json.loads(json.dumps(versions)) == versions
