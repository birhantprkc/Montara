"""Contract tests for the Python modules the `montara budget` and `montara resume`
CLI commands wrap (tools/cost_tracker.py, lib/checkpoint.py).

The CLI shells out to these via inline snippets; these tests pin the exact
behaviours the CLI depends on so the commands cannot silently break.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from tools.cost_tracker import (
    ApprovalRequiredError,
    BudgetExceededError,
    CostTracker,
    EntryStatus,
)
from lib.config_model import BudgetMode
from lib.checkpoint import (
    get_completed_stages,
    get_latest_checkpoint,
    get_next_stage,
    get_pipeline_stages,
)

E2E_PROJECT = (
    Path(__file__).resolve().parent.parent
    / "qa" / "output" / "e2e_pipeline"
)


def test_budget_estimate_reserve_reconcile_lifecycle(tmp_path):
    log = tmp_path / "cost_log.json"
    tracker = CostTracker(budget_total_usd=10.0, mode=BudgetMode.WARN, cost_log_path=log)

    entry_id = tracker.estimate("flux", "generate", 0.20)
    assert log.exists()  # persisted on estimate
    assert tracker._find(entry_id)["status"] == EntryStatus.ESTIMATED.value

    # First paid use of a tool requires approval in WARN mode.
    with pytest.raises(ApprovalRequiredError):
        tracker.reserve(entry_id)

    tracker.approve_tool("flux")
    tracker.reserve(entry_id)
    assert tracker.budget_reserved_usd == pytest.approx(0.20)

    tracker.reconcile(entry_id, 0.18, success=True)
    snap = tracker.cost_snapshot()
    assert snap["total_spent_usd"] == pytest.approx(0.18)
    assert snap["total_reserved_usd"] == pytest.approx(0.0)
    assert tracker.budget_remaining_usd == pytest.approx(9.82)

    # A fresh tracker reading the same log reconstructs the spend (CLI re-opens each call).
    reopened = CostTracker(budget_total_usd=10.0, cost_log_path=log)
    assert reopened.cost_snapshot()["total_spent_usd"] == pytest.approx(0.18)


def test_budget_cap_mode_blocks_overspend(tmp_path):
    log = tmp_path / "cost_log.json"
    tracker = CostTracker(
        budget_total_usd=0.10,
        mode=BudgetMode.CAP,
        single_action_approval_usd=100.0,
        require_approval_for_new_paid_tool=False,
        cost_log_path=log,
    )
    entry_id = tracker.estimate("kling", "video", 5.0)
    with pytest.raises(BudgetExceededError):
        tracker.reserve(entry_id)


def test_resume_reports_completed_project_has_no_next_stage():
    pipeline_dir = E2E_PROJECT
    project_id = "qa_e2e_test"
    latest = get_latest_checkpoint(pipeline_dir, project_id)
    assert latest is not None
    ptype = latest.get("pipeline_type")
    assert ptype == "animated-explainer"

    completed = get_completed_stages(pipeline_dir, project_id, ptype)
    assert "research" in completed and "publish" in completed
    # A fully-completed project resumes to None (nothing left to run).
    assert get_next_stage(pipeline_dir, project_id, ptype) is None


def test_resume_missing_project_is_handled():
    # The CLI relies on get_latest_checkpoint returning None (not raising) for unknown ids.
    assert get_latest_checkpoint(E2E_PROJECT, "does-not-exist") is None
    assert get_next_stage(E2E_PROJECT, "does-not-exist", "animated-explainer") == get_pipeline_stages("animated-explainer")[0]
