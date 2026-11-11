"""What a pipeline run used, for the results JSON."""

from __future__ import annotations

import importlib.metadata
from collections.abc import Iterable

#: Distributions behind the baseline and the reform figures. The ``imputation``
#: block records the classifier's packages separately (``classifier_versions``).
RUN_PACKAGES = ("policyengine-uk", "policyengine-core", "microdf-python", "numpy", "pandas")


def installed_versions(names: Iterable[str] = RUN_PACKAGES) -> dict[str, str | None]:
    """Each distribution's installed version, read from its metadata, or None if absent.

    Package metadata names the release that's installed. A module's
    ``__version__`` can disagree with it: microimpute 1.15.1 and 3.1.1 both set
    it to "1.1.2".
    """
    versions: dict[str, str | None] = {}
    for name in names:
        try:
            versions[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            versions[name] = None
    return versions
