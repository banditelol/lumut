---
title: "exp_data_editor"
description: An AnyWidget data editor with TanStack-powered virtual rows and capped measured text wrapping.
---

# exp_data_editor API

`exp_data_editor` mirrors the intentionally small contract of
`marimo.ui.data_editor`: supply tabular data, decide which columns are editable,
and read the edited rows from the widget value.

<div class="api-links"><a target="_blank" href="https://molab.marimo.io/github/banditelol/lumut/blob/main/demos/exp_data_editor.py/wasm?utm_source=lumut">Run the MoLab demo</a></div>

```python
import marimo as mo
from lumut import exp_data_editor

editor = mo.ui.anywidget(exp_data_editor(
    [{"name": "Ada", "notes": "Text can wrap over multiple lines."}],
    editable_columns=["notes"],
    max_row_height=160,
))

editor
```

The marimo wrapper exposes the edited rows as `editor.value`.

::: lumut.exp_data_editor.ExpDataEditor
