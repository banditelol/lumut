# Lumut development guide

Lumut is a small AnyWidget package for experimental notebook data editing.

## Commands

- `make install` installs Python and JavaScript dependencies.
- `make build` bundles the widget into `lumut/static/`.
- `make test` runs the focused Python tests.
- `make dev` watches the JavaScript bundle during visual work.

## Implementation rules

- Keep the public Python API small and typed.
- Preserve the `data_editor`-style contract: input data, `editable_columns`, and an edited `value` returned to Python.
- Use TanStack Table for column/cell state and TanStack Virtual for row geometry.
- Dynamic row height must be measured only for rendered rows; never scan all rows after a column resize.
- Cap row height with `max_row_height` and keep a conservative `estimated_row_height` for unmeasured rows.
- Support light and dark themes with component-scoped CSS variables.
- Keep source data and editor state separate: `data` is the Python-provided input and `value` is the edited output.

