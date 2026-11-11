"""Dependency pins that a rerun of the pipeline relies on.

These pins fix the imputation. policyengine-uk and the Hugging Face dataset
still float, so a rerun can differ from the published numbers for reasons the
pins don't cover. The results JSON records the policyengine-uk version and the
dataset URL (``run``).
"""

import ast
import re
import tomllib
from pathlib import Path

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

ROOT = Path(__file__).parent.parent
PYPROJECT = ROOT / "pyproject.toml"
MICROCOSM = ("microcosm-fit", "microcosm-frame", "microcosm-graph")
MICROCOSM_URL = re.compile(
    r"^git\+https://github\.com/PolicyEngine/microcosm@(?P<commit>[0-9a-f]{40})"
    r"#subdirectory=packages/(?P<package>[a-z-]+)$"
)


def _extras() -> dict[str, list[Requirement]]:
    project = tomllib.loads(PYPROJECT.read_text())["project"]
    return {
        name: [Requirement(spec) for spec in specs]
        for name, specs in project["optional-dependencies"].items()
    }


def test_imputation_extra_pins_microcosm_to_one_commit():
    """Microcosm doesn't publish to PyPI, so each package comes from one full commit hash."""
    pins = {canonicalize_name(req.name): req for req in _extras()["imputation"]}
    assert set(MICROCOSM) <= set(pins)
    commits = set()
    for name in MICROCOSM:
        req = pins[name]
        match = MICROCOSM_URL.match(req.url or "")
        assert match, f"{name} needs a git URL pinned to a full commit: {req.url!r}"
        assert match["package"] == name
        # A marker would drop the pin on some Python versions.
        assert req.marker is None
        commits.add(match["commit"])
    assert len(commits) == 1


def test_no_extra_requires_microimpute():
    """The package no longer imports microimpute, so no extra should install it."""
    for name, reqs in _extras().items():
        assert all(canonicalize_name(req.name) != "microimpute" for req in reqs), name


def test_package_does_not_import_microimpute():
    for path in (ROOT / "src" / "nics_exemption").glob("*.py"):
        tree = ast.parse(path.read_text(), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                modules = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom):
                modules = [node.module or ""]
            else:
                continue
            assert not any(m.split(".")[0] == "microimpute" for m in modules), path.name
