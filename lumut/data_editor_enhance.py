"""An experimental Glide Data Grid AnyWidget with rough wrapped-row sizing."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any, Literal

import anywidget
import traitlets

from .exp_data_editor import (
    EditableColumns,
    Row,
    WrappedColumns,
    _column_names,
    _infer_field_types,
    _to_rows,
    _validate_columns,
)


class DataEditorEnchance(anywidget.AnyWidget):
    """Edit tabular data with Glide Data Grid and approximate wrapped heights.

    This is deliberately separate from :class:`lumut.ExpDataEditor`. It carries
    the experimental Glide strategy from marimo's ``feat/data-editor-wrap``:
    when a wrapped column is resized, it estimates the maximum height in the
    visible window (plus a small buffer), temporarily applies it there, then
    applies that sampled height to all data rows when the pointer is released.

    The method avoids measuring every row during a resize, but it is not exact:
    rows outside the sample can be too tall or too short. Glide's variable-row
    callback also has poor scroll-geometry characteristics for huge datasets,
    so this widget is for experimentation and small-to-medium eager data only.
    """

    _esm = Path(__file__).parent / "static" / "data-editor-enchance.js"

    data = traitlets.List(traitlets.Dict(), default_value=[]).tag(sync=True)
    value = traitlets.List(traitlets.Dict(), default_value=[]).tag(sync=True)
    editable_columns = traitlets.Any("all").tag(sync=True)
    wrapped_columns = traitlets.Any(default_value=[]).tag(sync=True)
    field_types = traitlets.Dict(default_value={}).tag(sync=True)
    label = traitlets.Unicode("").tag(sync=True)
    width = traitlets.Unicode("100%").tag(sync=True)
    height = traitlets.Int(450).tag(sync=True)
    max_row_height = traitlets.Int(240).tag(sync=True)
    estimated_row_height = traitlets.Int(34).tag(sync=True)
    wrapped_row_height_strategy = traitlets.Unicode(
        "approxIncrementalRough"
    ).tag(sync=True)

    def __init__(
        self,
        data: Sequence[Mapping[str, Any]] | Mapping[str, Sequence[Any]] | Any,
        *,
        label: str = "",
        editable_columns: EditableColumns = "all",
        wrapped_columns: WrappedColumns = (),
        max_row_height: int = 240,
        estimated_row_height: int = 34,
        width: str = "100%",
        height: int = 450,
    ) -> None:
        if max_row_height < estimated_row_height:
            raise ValueError("max_row_height must be at least estimated_row_height")
        if height <= 0:
            raise ValueError("height must be positive")

        rows: list[Row] = _to_rows(data)
        columns = list(rows[0]) if rows else _column_names(data)
        _validate_columns(editable_columns, columns, "editable_columns")
        _validate_columns(wrapped_columns, columns, "wrapped_columns")

        super().__init__(
            data=rows,
            value=rows,
            editable_columns=(
                "all" if editable_columns == "all" else list(editable_columns)
            ),
            wrapped_columns=(
                "all" if wrapped_columns == "all" else list(wrapped_columns)
            ),
            field_types=_infer_field_types(rows, columns),
            label=label,
            width=width,
            height=height,
            max_row_height=max_row_height,
            estimated_row_height=estimated_row_height,
        )


def data_editor_enchance(
    data: Sequence[Mapping[str, Any]] | Mapping[str, Sequence[Any]] | Any,
    **kwargs: Any,
) -> DataEditorEnchance:
    """Create a :class:`DataEditorEnchance` (name retained intentionally)."""

    return DataEditorEnchance(data, **kwargs)
