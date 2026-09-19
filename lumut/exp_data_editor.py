"""A virtualized, auto-height experimental data editor."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any, Literal

import anywidget
import traitlets

Row = dict[str, Any]
EditableColumns = Sequence[str] | Literal["all"]
WrappedColumns = Sequence[str] | Literal["all"]


class ExpDataEditor(anywidget.AnyWidget):
    """Edit a small-to-medium tabular dataset in any AnyWidget runtime.

    The widget mirrors the intentionally small public contract of
    ``marimo.ui.data_editor``: it accepts tabular data, controls which columns
    may be edited, and synchronizes the fully edited rows through ``value``.
    Text rows are measured lazily as they enter the viewport. Heights are
    capped by ``max_row_height`` so a single long value cannot dominate the
    scroll geometry.

    Wrap this widget with ``mo.ui.anywidget`` in marimo. Its value is then
    available through the wrapper's ``value`` attribute.
    """

    _esm = Path(__file__).parent / "static" / "exp-data-editor.js"

    data = traitlets.List(traitlets.Dict(), default_value=[]).tag(sync=True)
    value = traitlets.List(traitlets.Dict(), default_value=[]).tag(sync=True)
    editable_columns = traitlets.Any("all").tag(sync=True)
    wrapped_columns = traitlets.Any("all").tag(sync=True)
    field_types = traitlets.Dict(default_value={}).tag(sync=True)
    label = traitlets.Unicode("").tag(sync=True)
    width = traitlets.Unicode("100%").tag(sync=True)
    height = traitlets.Int(450).tag(sync=True)
    max_row_height = traitlets.Int(240).tag(sync=True)
    estimated_row_height = traitlets.Int(34).tag(sync=True)

    def __init__(
        self,
        data: Sequence[Mapping[str, Any]] | Mapping[str, Sequence[Any]] | Any,
        *,
        label: str = "",
        editable_columns: EditableColumns = "all",
        wrapped_columns: WrappedColumns = "all",
        max_row_height: int = 240,
        estimated_row_height: int = 34,
        width: str = "100%",
        height: int = 450,
    ) -> None:
        if max_row_height < estimated_row_height:
            raise ValueError("max_row_height must be at least estimated_row_height")
        if height <= 0:
            raise ValueError("height must be positive")

        rows = _to_rows(data)
        columns = list(rows[0]) if rows else _column_names(data)
        _validate_columns(editable_columns, columns, "editable_columns")
        _validate_columns(wrapped_columns, columns, "wrapped_columns")

        super().__init__(
            data=rows,
            value=rows,
            editable_columns="all" if editable_columns == "all" else list(editable_columns),
            wrapped_columns="all" if wrapped_columns == "all" else list(wrapped_columns),
            field_types=_infer_field_types(rows, columns),
            label=label,
            width=width,
            height=height,
            max_row_height=max_row_height,
            estimated_row_height=estimated_row_height,
        )


def exp_data_editor(
    data: Sequence[Mapping[str, Any]] | Mapping[str, Sequence[Any]] | Any,
    **kwargs: Any,
) -> ExpDataEditor:
    """Create an :class:`ExpDataEditor`.

    The lowercase factory keeps notebook usage close to ``mo.ui.data_editor``.
    """

    return ExpDataEditor(data, **kwargs)


def _to_rows(data: Any) -> list[Row]:
    if isinstance(data, Mapping):
        values = {key: list(value) for key, value in data.items()}
        lengths = {len(value) for value in values.values()}
        if len(lengths) > 1:
            raise ValueError("column-oriented data must have equally sized columns")
        return [dict(zip(values, row, strict=True)) for row in zip(*values.values())]
    if isinstance(data, Sequence) and not isinstance(data, (str, bytes)):
        if not all(isinstance(row, Mapping) for row in data):
            raise TypeError("row-oriented data must be a sequence of mappings")
        return [dict(row) for row in data]
    if hasattr(data, "to_dicts"):
        return _to_rows(data.to_dicts())
    if hasattr(data, "to_dict"):
        records = data.to_dict(orient="records")
        return _to_rows(records)
    raise TypeError("data must be records, columns, or a dataframe with to_dict")


def _column_names(data: Any) -> list[str]:
    if isinstance(data, Mapping):
        return list(data)
    if hasattr(data, "columns"):
        return [str(column) for column in data.columns]
    return []


def _validate_columns(columns: EditableColumns | WrappedColumns, names: list[str], argument: str) -> None:
    if columns == "all":
        return
    missing = set(columns).difference(names)
    if missing:
        raise ValueError(f"{argument} contains unknown columns: {sorted(missing)}")


def _infer_field_types(rows: list[Row], columns: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for column in columns:
        values = (row.get(column) for row in rows)
        value = next((item for item in values if item is not None), None)
        if isinstance(value, bool):
            result[column] = "boolean"
        elif isinstance(value, int):
            result[column] = "integer"
        elif isinstance(value, float):
            result[column] = "number"
        else:
            result[column] = "string"
    return result
