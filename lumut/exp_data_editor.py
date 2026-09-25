"""A virtualized, auto-height experimental data editor."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import json
from pathlib import Path
from dataclasses import dataclass
from typing import Any, Callable, Literal, Protocol

import warnings

import anywidget
import traitlets

Row = dict[str, Any]
EditableColumns = Sequence[str] | Literal["all"]
WrappedColumns = Sequence[str] | Literal["all"]
ColumnSizingMode = Literal["auto", "fit"] | None
PaginationMode = Literal["client", "server", "remote"] | bool | None


class PageSource(Protocol):
    """A Python-backed source for server pagination."""

    def count(self) -> int: ...

    def page(self, *, offset: int, limit: int) -> Sequence[Mapping[str, Any]]: ...

    def apply_patch(self, patch: Mapping[str, Any]) -> bool: ...


@dataclass(frozen=True)
class RemotePageSource:
    """A browser-fetchable JSON page endpoint, suitable for Marimo WASM."""

    url: str
    row_count: int
    columns: Sequence[str]
    patch_url: str | None = None


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

    # Keep Python input separate from the browser transport: marimo reserves
    # `data` on some widget paths, so rows travel through `initial_rows`.
    data = traitlets.List(traitlets.Dict(), default_value=[]).tag(sync=False)
    initial_rows = traitlets.List(traitlets.Dict(), default_value=[]).tag(sync=True)
    # `data` is the browser input. `value` remains Python-side so an edit
    # does not echo an entire table back to the browser.
    value = traitlets.List(traitlets.Dict(), default_value=[]).tag(sync=False)
    patches = traitlets.List(traitlets.Dict(), default_value=[]).tag(sync=True)
    editable_columns = traitlets.Any("all").tag(sync=True)
    wrapped_columns = traitlets.Any("all").tag(sync=True)
    wrap_text = traitlets.Bool(True).tag(sync=True)
    auto_row_height = traitlets.Bool(True).tag(sync=True)
    column_sizing_mode = traitlets.Any(None, allow_none=True).tag(sync=True)
    pagination = traitlets.Bool(False).tag(sync=True)
    pagination_mode = traitlets.Unicode("none").tag(sync=True)
    page_size = traitlets.Int(25).tag(sync=True)
    page_size_options = traitlets.List(traitlets.Int(), default_value=[5, 10, 25, 50, 100]).tag(sync=True)
    row_count = traitlets.Int(0).tag(sync=True)
    page_rows = traitlets.List(traitlets.Dict(), default_value=[]).tag(sync=True)
    page_request = traitlets.Dict(default_value={}).tag(sync=True)
    remote_url = traitlets.Unicode("").tag(sync=True)
    remote_patch_url = traitlets.Unicode("").tag(sync=True)
    columns = traitlets.List(traitlets.Unicode(), default_value=[]).tag(sync=True)
    field_types = traitlets.Dict(default_value={}).tag(sync=True)
    label = traitlets.Unicode("").tag(sync=True)
    width = traitlets.Unicode("100%").tag(sync=True)
    height = traitlets.Int(450).tag(sync=True)
    max_row_height = traitlets.Int(240).tag(sync=True)
    estimated_row_height = traitlets.Int(34).tag(sync=True)

    def __init__(
        self,
        data: Sequence[Mapping[str, Any]] | Mapping[str, Sequence[Any]] | Any | None = None,
        *,
        label: str = "",
        on_change: Callable[[list[Row]], None] | None = None,
        editable_columns: EditableColumns = "all",
        wrapped_columns: WrappedColumns = "all",
        wrap_text: bool = True,
        auto_row_height: bool = True,
        column_sizing_mode: ColumnSizingMode = None,
        pagination: PaginationMode = None,
        page_size: int | None = None,
        source: PageSource | RemotePageSource | None = None,
        max_row_height: int = 240,
        estimated_row_height: int = 34,
        width: str = "100%",
        height: int = 450,
    ) -> None:
        if max_row_height < estimated_row_height:
            raise ValueError("max_row_height must be at least estimated_row_height")
        if height <= 0:
            raise ValueError("height must be positive")
        if column_sizing_mode not in (None, "auto", "fit"):
            raise ValueError("column_sizing_mode must be 'auto', 'fit', or None")
        if page_size is not None and page_size <= 0:
            raise ValueError("page_size must be positive")

        if data is not None and source is not None:
            raise ValueError("pass either data or source, not both")
        mode = _pagination_mode(pagination, source)
        if mode == "remote" and not isinstance(source, RemotePageSource):
            raise ValueError("pagination=\"remote\" requires RemotePageSource")
        if mode == "server" and source is None:
            raise ValueError("pagination=\"server\" requires a PageSource")

        source_rows: list[Row] = []
        initial_page: list[Row] = []
        row_count = 0
        if mode == "server":
            row_count = source.count()  # type: ignore[union-attr]
            initial_page = [dict(row) for row in source.page(offset=0, limit=page_size or 25)]  # type: ignore[union-attr]
            columns = list(initial_page[0]) if initial_page else []
        elif mode == "remote":
            row_count = source.row_count  # type: ignore[union-attr]
            columns = list(source.columns)  # type: ignore[union-attr]
        else:
            source_rows = _to_rows(data if data is not None else [])
            row_count = len(source_rows)
            columns = list(source_rows[0]) if source_rows else _column_names(data)
            estimated_bytes = _estimate_transport_bytes(source_rows)
            if len(source_rows) > 50_000 or estimated_bytes > 8 * 1024 * 1024:
                warnings.warn(
                    "eager data will send "
                    f"{len(source_rows):,} rows (about {_format_bytes(estimated_bytes)}) to the browser; "
                    "recommended eager maximum is 50,000 rows and 8 MiB. "
                    "Use pagination=\"server\" or \"remote\" for larger datasets.",
                    RuntimeWarning,
                    stacklevel=2,
                )

        _validate_columns(editable_columns, columns, "editable_columns")
        _validate_columns(wrapped_columns, columns, "wrapped_columns")
        self._source = source
        self._pagination_mode = mode

        super().__init__(
            data=source_rows if mode in ("none", "client") else [],
            initial_rows=source_rows if mode in ("none", "client") else [],
            value=[dict(row) for row in source_rows] if mode in ("none", "client") else [],
            editable_columns="all" if editable_columns == "all" else list(editable_columns),
            wrapped_columns="all" if wrapped_columns == "all" else list(wrapped_columns),
            wrap_text=wrap_text,
            auto_row_height=auto_row_height,
            column_sizing_mode=column_sizing_mode,
            pagination=mode != "none",
            pagination_mode=mode,
            page_size=page_size or 25,
            row_count=row_count,
            page_rows=initial_page or (source_rows[: page_size or 25] if mode == "client" else []),
            remote_url=source.url if isinstance(source, RemotePageSource) else "",
            remote_patch_url=(source.patch_url or source.url) if isinstance(source, RemotePageSource) else "",
            columns=columns,
            field_types=_infer_field_types(initial_page or source_rows, columns),
            label=label,
            width=width,
            height=height,
            max_row_height=max_row_height,
            estimated_row_height=estimated_row_height,
        )
        self._on_change = on_change
        if on_change is not None:
            self.observe(self._notify_change, names="value")

    @traitlets.observe("page_request")
    def _serve_page(self, change: dict[str, Any]) -> None:
        if self._pagination_mode != "server" or self._source is None:
            return
        request = change["new"]
        page = request.get("page")
        size = request.get("page_size", self.page_size)
        if not isinstance(page, int) or page < 0 or not isinstance(size, int) or size <= 0:
            return
        self.page_size = size
        self.page_rows = [dict(row) for row in self._source.page(offset=page * size, limit=size)]

    @traitlets.observe("patches")
    def _apply_patches(self, change: dict[str, Any]) -> None:
        if not any(self._apply_patch(patch) for patch in change["new"]):
            return
        self.notify_change({"name": "value", "old": None, "new": self.value, "owner": self, "type": "change"})

    def _apply_patch(self, patch: Mapping[str, Any]) -> bool:
        if self._source is not None:
            return bool(self._source.apply_patch(patch))
        operation = patch.get("op")
        if operation == "set":
            row, column = patch.get("row"), patch.get("column")
            if (
                not isinstance(row, int)
                or not isinstance(column, str)
                or not 0 <= row < len(self.value)
                or column not in self.value[row]
                or (self.editable_columns != "all" and column not in self.editable_columns)
                or self.value[row][column] == patch.get("value")
            ):
                return False
            self.value[row][column] = patch.get("value")
            return True
        if operation == "append" and isinstance(patch.get("row"), Mapping):
            self.value.append(dict(patch["row"]))
            return True
        if operation == "delete":
            row = patch.get("row")
            if isinstance(row, int) and 0 <= row < len(self.value):
                del self.value[row]
                return True
            return False
        if operation == "add_column":
            name = patch.get("name")
            if not isinstance(name, str) or not name or any(name in row for row in self.value):
                return False
            for row in self.value:
                row[name] = patch.get("default")
            return True
        return False

    def _notify_change(self, change: dict[str, Any]) -> None:
        if self._on_change is not None:
            self._on_change(change["new"])


def exp_data_editor(
    data: Sequence[Mapping[str, Any]] | Mapping[str, Sequence[Any]] | Any | None = None,
    **kwargs: Any,
) -> ExpDataEditor:
    """Create an :class:`ExpDataEditor`.

    The lowercase factory keeps notebook usage close to ``mo.ui.data_editor``.
    """

    return ExpDataEditor(data, **kwargs)


def _estimate_transport_bytes(rows: list[Row]) -> int:
    if not rows:
        return 0
    sample = rows[: min(1_000, len(rows))]
    encoded = json.dumps(sample, default=str, separators=(",", ":")).encode()
    return round(len(encoded) * len(rows) / len(sample))


def _format_bytes(size: int) -> str:
    return f"{size / 1024 / 1024:.1f} MiB"


def _pagination_mode(pagination: PaginationMode, source: PageSource | RemotePageSource | None) -> str:
    if pagination is True:
        return "client"
    if pagination is False:
        return "none"
    if pagination is None:
        if isinstance(source, RemotePageSource):
            return "remote"
        return "server" if source is not None else "none"
    if pagination not in ("client", "server", "remote"):
        raise ValueError("pagination must be a bool, \"client\", \"server\", or \"remote\"")
    return pagination


def _to_rows(data: Any) -> list[Row]:
    if isinstance(data, Mapping):
        values = {key: list(value) for key, value in data.items()}
        lengths = {len(value) for value in values.values()}
        if len(lengths) > 1:
            raise ValueError("column-oriented data must have equally sized columns")
        return [dict(zip(values, row, strict=True)) for row in zip(*values.values())]
    if isinstance(data, Sequence) and not isinstance(data, (str, bytes)):
        if all(isinstance(row, Mapping) for row in data):
            return [dict(row) for row in data]
        if all(not isinstance(item, (Mapping, Sequence)) or isinstance(item, (str, bytes)) for item in data):
            return [{"value": item} for item in data]
        raise TypeError("row-oriented data must be a sequence of mappings or scalars")
    if hasattr(data, "to_dicts"):
        return _to_rows(data.to_dicts())
    if hasattr(data, "to_pydict"):
        return _to_rows(data.to_pydict())
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
