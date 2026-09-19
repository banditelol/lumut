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

## Why this does not use Glide Data Grid

Glide Data Grid remains a capable canvas-based editor, but its public
`rowHeight` API is either one constant or a callback indexed by row. In the
current implementation, the callback path requires the grid to walk row
heights to derive total height and map a scroll offset to a row. A cached
callback therefore does not make exact variable wrapped-row height suitable for
very large datasets. The upstream "fit content" request was discussed as a
consumer-side canvas-measurement workaround rather than delivered as a native
auto-height API.

Lumut instead uses TanStack Virtual's dynamic measurement model: unseen rows
have an estimate, rendered rows are measured, and the virtualizer adjusts
geometry as measurements arrive. `max_row_height` makes that refinement
bounded and predictable after column resizing.

Maintenance is a second consideration. Glide's most recent stable GitHub
release is 6.0.3 (February 2024), while development since then has appeared as
intermittent 6.0.4 alpha commits. That does not mean the project is abandoned,
but it makes an upstream change to its scroll geometry a higher-risk dependency
for an experimental component. Lumut depends on the MIT-licensed TanStack
Table and TanStack Virtual projects instead, and owns only the narrow editor
surface it needs.

References:

- [Glide `rowHeight` API](https://github.com/glideapps/glide-data-grid/blob/main/packages/core/API.md)
- [Glide issue #581: Make Row Height Fit Content](https://github.com/glideapps/glide-data-grid/issues/581)
- [Glide releases](https://github.com/glideapps/glide-data-grid/releases)
- [TanStack Virtual dynamic measurement example](https://tanstack.com/virtual/latest/docs/framework/react/examples/dynamic)

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
