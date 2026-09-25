---
title: "exp_data_editor"
description: An AnyWidget data editor with TanStack-powered virtual rows and capped measured text wrapping.
---

# exp_data_editor API

`exp_data_editor` mirrors the intentionally small contract of
`marimo.ui.data_editor`: supply tabular data, decide which columns are editable,
and read the edited rows from the widget value.

It accepts marimo's documented eager-data forms: dataframe-like inputs,
scalars (shown in a `value` column), records, and mappings of columns. It also accepts `label`, `on_change`, `column_sizing_mode`, `pagination`, and
`page_size`. `pagination=True` is client-side pagination for eager data. For
large datasets, use `pagination="server"` with a Python page source, or
`pagination="remote"` with `RemotePageSource` when running in Marimo WASM. Passing a
`PageSource` or `RemotePageSource` selects its matching large-data mode by default.

<div class="api-links"><a target="_blank" href="https://molab.marimo.io/github/banditelol/lumut/blob/main/demos/exp_data_editor.py/wasm?utm_source=lumut">Run the MoLab demo</a></div>

```python
import marimo as mo
from lumut import exp_data_editor

editor = mo.ui.anywidget(exp_data_editor(
    [{"name": "Ada", "notes": "Text can wrap over multiple lines."}],
    editable_columns=["notes"],
    wrapped_columns=["notes"],
    wrap_text=True,
    auto_row_height=True,
    max_row_height=160,
))

editor
```

Server and remote pagination synchronize compact edit patches; they do not eagerly materialize a full `editor.value`. Remote endpoints must return either a row array or `{ "rows": [...], "row_count": N }` for `?offset=N&limit=N` requests, and accept `PATCH { "patches": [...] }`. Set `wrap_text=False`
to truncate text in every column, or `auto_row_height=False` to keep every row at
`estimated_row_height`; `wrapped_columns` selects which columns may wrap when
wrapping is enabled.

::: lumut.exp_data_editor.ExpDataEditor
