"""Dependency pins that a rerun of the published results relies on."""

import tomllib
from pathlib import Path

from packaging.requirements import Requirement

PYPROJECT = Path(__file__).parent.parent / "pyproject.toml"


def _extra(name: str) -> dict[str, Requirement]:
    project = tomllib.loads(PYPROJECT.read_text())["project"]
    reqs = [Requirement(spec) for spec in project["optional-dependencies"][name]]
    return {req.name: req for req in reqs}


def test_simulation_extra_pins_microimpute_exactly():
    """The pipeline imputes with microimpute; a looser spec would resolve a newer release."""
    assert str(_extra("simulation")["microimpute"].specifier) == "==1.15.1"


def test_simulation_extra_caps_scikit_learn_below_1_9():
    """microimpute 1.15.1 allows scikit-learn 1.9, whose forests draw samples by weight."""
    spec = _extra("simulation")["scikit-learn"].specifier
    assert "1.8.0" in spec
    assert "1.9.0" not in spec
