"""Executable specifications for the Marimo-compatible editor roadmap.

The xfail cases describe the public contract Lumut needs for workflow parity.
They deliberately pass today while the corresponding implementation issue is
open; remove the marker when the feature lands.
"""

from __future__ import annotations

import datetime as dt

import pytest

from lumut import ExpDataEditor, exp_data_editor


@pytest.mark.xfail(reason="Workflow parity: synchronize an explicit ordered schema")
def test_empty_column_oriented_data_retains_its_columns() -> None:
    widget = exp_data_editor({"name": [], "created": []})

    assert widget.columns == ["name", "created"]
    assert widget.value == {"name": [], "created": []}


@pytest.mark.xfail(reason="Workflow parity: preserve the caller's container type")
def test_column_oriented_value_round_trips_as_columns() -> None:
    widget = exp_data_editor({"name": ["Ada"], "score": [1]})

    widget.apply_edits([{"rowIdx": 0, "columnId": "score", "value": 2}])

    assert widget.value == {"name": ["Ada"], "score": [2]}


@pytest.mark.xfail(reason="Workflow parity: expose and apply incremental edits")
def test_edits_are_small_and_do_not_duplicate_the_dataset() -> None:
    widget = exp_data_editor([{"name": "Ada"}] * 10_000)

    assert widget.edits == []
    widget.apply_edits([{"rowIdx": 9_999, "columnId": "name", "value": "Grace"}])

    assert widget.edits == [
        {"rowIdx": 9_999, "columnId": "name", "value": "Grace"}
    ]


@pytest.mark.xfail(reason="Workflow parity: preserve temporal field types")
def test_temporal_values_have_a_typed_schema() -> None:
    widget = exp_data_editor(
        [{"day": dt.date(2026, 9, 25), "when": dt.datetime(2026, 9, 25, 8)}]
    )

    assert widget.field_types == {"day": "date", "when": "datetime"}


@pytest.mark.xfail(reason="Workflow parity: nullable numeric edits are validated")
def test_invalid_numeric_edits_do_not_silently_coerce() -> None:
    widget = ExpDataEditor([{"score": 3}])

    with pytest.raises(ValueError, match="integer"):
        widget.apply_edits([{"rowIdx": 0, "columnId": "score", "value": "3oops"}])

    widget.apply_edits([{"rowIdx": 0, "columnId": "score", "value": ""}])
    assert widget.value == [{"score": None}]


@pytest.mark.xfail(reason="Workflow parity: column edits preserve display and output order")
def test_column_edits_support_insert_rename_and_remove() -> None:
    widget = exp_data_editor([{"name": "Ada", "score": 1}])

    widget.apply_edits(
        [
            {"columnIdx": 1, "newName": "role", "type": "insert"},
            {"columnIdx": 2, "newName": "points", "type": "rename"},
            {"columnIdx": 0, "type": "remove"},
        ]
    )

    assert widget.columns == ["role", "points"]
    assert widget.value == [{"role": None, "points": 1}]
