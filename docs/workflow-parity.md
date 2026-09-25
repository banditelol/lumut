---
title: "Workflow parity roadmap"
description: Issue-ready roadmap for matching the Marimo data-editor workflow with Lumut's TanStack implementation.
---

# Workflow parity roadmap

`exp_data_editor` targets **workflow parity** with
[`marimo.ui.data_editor`](https://docs.marimo.io/api/inputs/data_editor/), not
pixel-for-pixel or million-row canvas parity with
[Glide Data Grid](https://docs.grid.glideapps.com/api/dataeditor). Lumut keeps
its TanStack Table and TanStack Virtual foundation so it can retain measured,
capped, wrapped row heights.

![Current exp_data_editor preview](assets/gallery/exp-data-editor.svg)

## Definition of done

For a supported eager input—scalars, records, column mappings, or a dataframe—a
user can type, validate, navigate, copy/paste, fill, search, add/delete rows,
and manage columns. The edited Python value has the source's container type and
correct scalar types. Row height measurement remains limited to rendered rows.

The upstream behavior and implementation references are:

- [Marimo data-editor API](https://docs.marimo.io/api/inputs/data_editor/)
- [Marimo Python edit application](https://github.com/marimo-team/marimo/blob/main/marimo/_plugins/ui/_impl/data_editor.py)
- [Marimo Glide frontend](https://github.com/marimo-team/marimo/blob/main/frontend/src/plugins/impl/data-editor/glide-data-editor.tsx)
- [Glide DataEditor API](https://docs.grid.glideapps.com/api/dataeditor)
- [Glide cell and interaction examples](https://github.com/glideapps/glide-data-grid/tree/main/packages/core/src/docs/examples)

## Issue drafts

Each heading below is an issue-ready title and body. The specs in
`tests/test_exp_data_editor_workflow_parity.py` are deliberately marked xfail
until their linked behavior is implemented.

### 1. Add an ordered schema and incremental edit protocol

**Labels:** `feature`, `architecture`, `workflow-parity`

Replace full-table `value` synchronization per mutation with a compact,
ordered edit log for cell, row, and column operations. Synchronize columns even
when there are zero rows. Keep source `data` immutable and derive the local
edited state from it plus edits.

Acceptance criteria:

- Support positional, row-remove, column-insert, column-rename, and
  column-remove edits.
- One cell edit has payload size independent of table size.
- Empty column mappings retain visible headers.
- Preserve a separate, ordered `columns` trait rather than deriving from row 0.
- Add and un-xfail the first three parity specifications.

References: [Marimo edit types and application](https://github.com/marimo-team/marimo/blob/main/marimo/_plugins/ui/_impl/data_editor.py), [Glide immutable-data callback model](https://docs.grid.glideapps.com/api/dataeditor#changes-to-your-data).

### 2. Preserve input container and dataframe schema on edited output

**Labels:** `feature`, `python`, `workflow-parity`

Introduce a small typed data adapter that normalizes frontend rows while
reconstructing scalar lists, row records, column mappings, Pandas, Polars, and
PyArrow values on the Python side. Preserve column order and native types.

Acceptance criteria:

- Edited output has the same broad container type as input.
- Dataframe output retains its backend and schema where possible.
- Empty dataframe and empty mapping schemas are supported.
- The column-oriented round-trip specification passes.

References: [Marimo supported input/output shapes](https://docs.marimo.io/api/inputs/data_editor/), [Marimo dataframe conversion](https://github.com/marimo-team/marimo/blob/main/marimo/_plugins/ui/_impl/data_editor.py).

### 3. Implement typed schema, editors, defaults, and validation

**Labels:** `feature`, `frontend`, `workflow-parity`

Expand field types beyond string/integer/number/boolean to date, datetime,
time, list/categorical, geometry, and unknown. Add type-appropriate editors,
defaults for new rows, nullable numeric behavior, and validation that rejects
invalid values instead of silently coercing them.

Acceptance criteria:

- Empty numeric edits become `None`; invalid numerics do not become partial
  values such as `parseInt("3oops") == 3`.
- The add-column type selector only offers implemented types.
- Date/time values round-trip through an explicit wire format.
- The temporal and numeric xfail specifications pass.

References: [Marimo validation and new-row defaults](https://github.com/marimo-team/marimo/blob/main/frontend/src/plugins/impl/data-editor/glide-data-editor.tsx), [Glide cell kinds](https://docs.grid.glideapps.com/api/cells).

### 4. Add spreadsheet clipboard, paste validation, and vertical fill

**Labels:** `feature`, `frontend`, `workflow-parity`

Add TSV copy for selected ranges, multi-cell paste, and a vertical fill handle.
Apply pasted/fill values only to editable cells, validate each typed value, and
emit one batched edit operation.

Acceptance criteria:

- Copy produces tab/newline-delimited selected cells.
- Paste respects selection anchors and skips protected columns.
- Vertical fill copies typed values and rejects invalid values atomically.
- Paste/fill emits a single save operation.

References: [Marimo clipboard and fill configuration](https://github.com/marimo-team/marimo/blob/main/frontend/src/plugins/impl/data-editor/glide-data-editor.tsx), [Glide selection and paste API](https://docs.grid.glideapps.com/api/dataeditor).

### 5. Complete the column-management workflow

**Labels:** `feature`, `frontend`, `workflow-parity`

Extend the existing column menu with rename and delete, and make insertions
preserve both visible and serialized order. As in Marimo, allow rename/delete
only when `editable_columns="all"`; allow copy and add-column otherwise.

Acceptance criteria:

- Duplicate names show an accessible error and do not mutate data.
- The final remaining column cannot be deleted.
- Insert, rename, and delete update schema, field types, row data, and output
  order together.
- The column-lifecycle xfail specification passes.

References: [Marimo column menu behavior](https://github.com/marimo-team/marimo/blob/main/frontend/src/plugins/impl/data-editor/glide-data-editor.tsx), [Glide header menus](https://docs.grid.glideapps.com/api/dataeditor).

### 6. Add grid search and complete keyboard selection semantics

**Labels:** `feature`, `frontend`, `accessibility`, `workflow-parity`

Implement `Ctrl/Cmd+F` search, Escape-to-dismiss, robust selection extension,
and deletion/navigation across virtualized boundaries. Use roving focus and
ARIA grid roles so the grid has one tab stop rather than one per rendered cell.

Acceptance criteria:

- Search opens with the standard shortcut and navigates matches.
- Shift-arrow expands selection; keyboard commands work after scrolling.
- Screen readers receive row/column context and editable/read-only state.
- Browser tests cover keyboard-only editing.

References: [Marimo search shortcut handling](https://github.com/marimo-team/marimo/blob/main/frontend/src/plugins/impl/data-editor/glide-data-editor.tsx), [Glide accessibility overview](https://github.com/glideapps/glide-data-grid).

### 7. Virtualize columns and set a performance budget

**Labels:** `performance`, `frontend`, `workflow-parity`

Keep the required rendered-row-only measurement but virtualize wide tables
horizontally. Batch large edits, avoid all-row scans on resize, and define
benchmarks for 100k rows and 1k columns.

Acceptance criteria:

- Only mounted rows are measured after a column resize.
- Only visible/overscanned columns are mounted.
- A one-cell edit does not clone or serialize every row.
- Schema mutation controls are disabled or deliberately handled for very large
  data, matching Marimo's guarded behavior.

References: [Glide performance model](https://github.com/glideapps/glide-data-grid), [Marimo large-dataset guards](https://github.com/marimo-team/marimo/blob/main/frontend/src/plugins/impl/data-editor/glide-data-editor.tsx).

### 8. Add browser-level workflow parity coverage and update the demo

**Labels:** `testing`, `documentation`, `workflow-parity`

Set up browser tests for the interactions that Python unit tests cannot verify:
cell editing, typed validation, clipboard, fill, search, resize/re-measure,
column actions, empty schemas, dark theme, and keyboard navigation. Update the
demo with a compact parity fixture alongside the existing long-text stress
fixture.

Acceptance criteria:

- The xfail contract file shrinks as features land.
- Browser tests cover the stated workflow matrix.
- The demo remains a visual regression fixture for capped dynamic row heights.

References: [current Lumut demo](https://molab.marimo.io/github/banditelol/lumut/blob/main/demos/exp_data_editor.py/wasm), [Glide examples](https://github.com/glideapps/glide-data-grid/tree/main/packages/core/src/docs/examples).
