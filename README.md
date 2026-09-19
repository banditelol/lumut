# lumut

An experimental, MIT-licensed AnyWidget data editor for notebook runtimes. It
uses TanStack Table for table state and TanStack Virtual for lazy, measured row
heights.

## Why it exists

`lumut.exp_data_editor` explores a small, marimo-compatible data-editor
contract without inheriting a grid library's entire feature surface. It accepts
row-oriented data, column-oriented data, or pandas-like dataframes; honours
`editable_columns`; and synchronizes fully edited rows as `value`.

Rows are measured only after they are rendered. Wrapped content can grow a row,
but never beyond `max_row_height`. Resizing a column triggers a remeasurement
of rendered rows, rather than an O(N) pass over all data.

## Install and use

```bash
uv pip install -e .
npm install
npm run build
```

```python
import marimo as mo
from lumut import exp_data_editor

editor = mo.ui.anywidget(exp_data_editor(
    [
        {"name": "Ada", "notes": "A long value that can wrap naturally."},
        {"name": "Grace", "notes": "Another editable row."},
    ],
    label="People",
    editable_columns=["notes"],
    max_row_height=160,
))

editor
```

`editor.value` is the edited list of row dictionaries.

## Scope

This first experiment intentionally includes typed cell editing, column resize,
wrapped text, capped dynamic heights, and the AnyWidget value bridge. It does
not yet implement spreadsheet range selection, fill handles, structural
row/column operations, search, or server/windowed data.

## Project conventions

The project follows the useful parts of [wigglystuff](https://github.com/koaning/wigglystuff): a Python AnyWidget class, a bundled JavaScript entry point,
static assets packaged by Hatchling, a `Makefile`, and focused Python tests.

`AGENTS.md` is the Codex-native replacement for wigglystuff's Claude-facing
instructions. `.codex/workflows.md` records the equivalent development
commands. Conductor's declarative workspace schema (`.conductor/settings.toml`)
has no Codex equivalent, so it is intentionally not copied; the command mapping
is documented in `.codex/workflows.md` instead.

## Development

```bash
make install
make build
make test
make dev
```

To inspect the widget in marimo after installing the package locally, run
`uv run --with marimo marimo edit demos/exp_data_editor.py`.
