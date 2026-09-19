import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import DataEditor, { GridCellKind } from "@glideapps/glide-data-grid";

const DEFAULT_ROW_HEIGHT = 34;
const DEFAULT_COLUMN_WIDTH = 200;
const WINDOW_BUFFER = 20;
const CHAR_WIDTH = 7.2;
const LINE_HEIGHT = 20;
const CELL_PADDING = 32;

function isEditable(column, editableColumns) {
  return editableColumns === "all" || editableColumns.includes(column);
}

function isWrapped(column, wrappedColumns) {
  return wrappedColumns === "all" || wrappedColumns.includes(column);
}

function coerce(value, type) {
  if (type === "boolean") return Boolean(value);
  if (type === "integer") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (type === "number") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return value;
}

function textHeight(value, width, maxHeight) {
  const text = value == null ? "" : String(value);
  if (!text) return DEFAULT_ROW_HEIGHT;
  const charsPerLine = Math.max(1, Math.floor(Math.max(48, width - CELL_PADDING) / CHAR_WIDTH));
  const lines = text.split("\n").reduce(
    (total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)),
    0,
  );
  return Math.min(maxHeight, Math.max(DEFAULT_ROW_HEIGHT, Math.ceil(lines * LINE_HEIGHT + 14)));
}

function sampleHeight(rows, columns, wrappedColumns, widths, start, end, maxHeight) {
  let height = DEFAULT_ROW_HEIGHT;
  for (let row = start; row <= end; row += 1) {
    const item = rows[row];
    if (!item) continue;
    for (const column of columns) {
      if (!isWrapped(column.title, wrappedColumns) || column.kind !== GridCellKind.Text) continue;
      height = Math.max(height, textHeight(item[column.title], widths[column.title] ?? DEFAULT_COLUMN_WIDTH, maxHeight));
    }
  }
  return height;
}

function Editor({ model }) {
  const editorRef = useRef(null);
  const resizeRef = useRef(null);
  const visibleRowsRef = useRef({ start: 0, end: 0 });
  const [rows, setRows] = useState(() => model.get("value") || model.get("data") || []);
  const [widths, setWidths] = useState({});
  const [roughHeights, setRoughHeights] = useState(null);
  const editableColumns = model.get("editable_columns");
  const wrappedColumns = model.get("wrapped_columns");
  const fieldTypes = model.get("field_types") || {};
  const maxRowHeight = model.get("max_row_height");

  useEffect(() => {
    const sync = () => setRows(model.get("value") || model.get("data") || []);
    model.on("change:data", sync);
    return () => model.off("change:data", sync);
  }, [model]);

  const columns = useMemo(() => Object.keys(rows[0] || {}).map((title) => ({
    id: title,
    title,
    width: widths[title],
    hasMenu: false,
    kind: fieldTypes[title] === "boolean" ? GridCellKind.Boolean : fieldTypes[title] === "number" || fieldTypes[title] === "integer" ? GridCellKind.Number : GridCellKind.Text,
  })), [fieldTypes, rows, widths]);

  const commit = useCallback((cell, nextCell) => {
    const [columnIndex, rowIndex] = cell;
    const column = columns[columnIndex];
    if (!column || !isEditable(column.title, editableColumns)) return;
    const nextRows = rows.map((row, index) => index === rowIndex
      ? { ...row, [column.title]: coerce(nextCell.data, fieldTypes[column.title]) }
      : row);
    setRows(nextRows);
    model.set("value", nextRows);
    model.save_changes();
  }, [columns, editableColumns, fieldTypes, model, rows]);

  const getCellContent = useCallback(([columnIndex, rowIndex]) => {
    const column = columns[columnIndex];
    const value = rows[rowIndex]?.[column.title];
    const editable = isEditable(column.title, editableColumns);
    if (column.kind === GridCellKind.Boolean) {
      return { kind: GridCellKind.Boolean, data: Boolean(value), allowOverlay: false, readonly: !editable };
    }
    if (column.kind === GridCellKind.Number) {
      return { kind: GridCellKind.Number, data: value ?? null, displayData: value == null ? "" : String(value), allowOverlay: editable, readonly: !editable };
    }
    return {
      kind: GridCellKind.Text,
      data: value == null ? "" : String(value),
      displayData: value == null ? "" : String(value),
      allowOverlay: editable,
      allowWrapping: isWrapped(column.title, wrappedColumns),
      readonly: !editable,
    };
  }, [columns, editableColumns, rows, wrappedColumns]);

  const onColumnResize = useCallback((column, width) => {
    const nextWidths = { ...widths, [column.title]: width };
    setWidths(nextWidths);
    if (!isWrapped(column.title, wrappedColumns)) return;
    const { start, end } = visibleRowsRef.current;
    const sampleStart = Math.max(0, start - WINDOW_BUFFER);
    const sampleEnd = Math.min(rows.length - 1, end + WINDOW_BUFFER);
    const sampled = sampleHeight(rows, columns, wrappedColumns, nextWidths, sampleStart, sampleEnd, maxRowHeight);
    // The rough branch only changes a bounded window while the pointer moves.
    setRoughHeights({ mode: "window", start: sampleStart, end: sampleEnd, height: sampled });
    resizeRef.current = { height: sampled };
  }, [columns, maxRowHeight, rows, widths, wrappedColumns]);

  useEffect(() => {
    const finishResize = () => {
      if (!resizeRef.current) return;
      // This is intentionally approximate: sample one local window then use it
      // globally, rather than performing an O(N) measurement while dragging.
      setRoughHeights({ mode: "all", height: resizeRef.current.height });
      resizeRef.current = null;
    };
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("mouseup", finishResize);
    return () => {
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("mouseup", finishResize);
    };
  }, []);

  const rowHeight = useCallback((row) => {
    if (row >= rows.length || !roughHeights) return DEFAULT_ROW_HEIGHT;
    if (roughHeights.mode === "all") return roughHeights.height;
    return row >= roughHeights.start && row <= roughHeights.end ? roughHeights.height : DEFAULT_ROW_HEIGHT;
  }, [roughHeights, rows.length]);

  return <div className="lumut-glide" style={{ width: model.get("width") }}>
    {model.get("label") && <div className="lumut-glide-label">{model.get("label")}</div>}
    <DataEditor
      ref={editorRef}
      columns={columns}
      getCellContent={getCellContent}
      height={model.get("height")}
      width="100%"
      rows={rows.length}
      rowHeight={rowHeight}
      rowMarkers={{ kind: "number" }}
      onCellEdited={commit}
      onColumnResize={onColumnResize}
      onVisibleRegionChanged={(range) => {
        visibleRowsRef.current = {
          start: Math.max(0, range.y),
          end: Math.max(0, range.y + Math.max(0, range.height - 1)),
        };
      }}
    />
  </div>;
}

const STYLE = `
.lumut-glide { border: 1px solid #d7dce3; border-radius: 8px; overflow: hidden; }
.lumut-glide-label { border-bottom: 1px solid #d7dce3; font: 600 13px/1.4 ui-sans-serif, system-ui, sans-serif; padding: 8px 12px; }
@media (prefers-color-scheme: dark) { .lumut-glide { border-color: #30363d; } .lumut-glide-label { border-color: #30363d; } }
`;

function render({ model, el }) {
  const style = document.createElement("style");
  style.textContent = STYLE;
  el.appendChild(style);
  const mount = document.createElement("div");
  el.appendChild(mount);
  const root = createRoot(mount);
  root.render(<Editor model={model} />);
  return () => root.unmount();
}

export default { render };
