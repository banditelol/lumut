---
title: "data_editor_enhance"
description: A Glide Data Grid AnyWidget with an approximate visible-window wrapped-row resize experiment.
---

# data_editor_enhance API

`data_editor_enhance` has the same small eager-data, editable-column, and
edited-value contract as `exp_data_editor`. Its additional `wrapped_columns`
option enables the experimental rough resize strategy adapted from marimo's
`feat/data-editor-wrap` branch.

It accepts the same dataframe-like, scalar, record, and column-oriented inputs
as `marimo.ui.data_editor`, plus its documented `label`, `on_change`,
`column_sizing_mode`, `pagination`, and `page_size` options. Edited values are
synchronized as row dictionaries for AnyWidget.

<div class="api-links"><a target="_blank" href="https://molab.marimo.io/github/banditelol/lumut/blob/main/demos/data_editor_enhance.py/wasm?utm_source=lumut">Run the MoLab demo</a></div>

```python
import marimo as mo
from lumut import data_editor_enhance

editor = mo.ui.anywidget(data_editor_enhance(
    [{"notes": "Resize this wrapped column."}],
    editable_columns=["notes"],
    wrapped_columns=["notes"],
    max_row_height=160,
))
```

On column resize, the widget measures only the visible rows plus a 20-row
buffer. On pointer release it reuses the sampled maximum for all rows. This is
bounded and responsive, but it is not exact; do not use it for million-row
datasets or content-fit layout requirements.

::: lumut.data_editor_enhance.DataEditorEnhance
