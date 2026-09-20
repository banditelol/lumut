import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import DataEditor, { GridCellKind, GridColumnIcon } from "@glideapps/glide-data-grid";
import glideStyles from "@glideapps/glide-data-grid/dist/index.css";

const DEFAULT_ROW_HEIGHT = 34;
const DEFAULT_COLUMN_WIDTH = 260;
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

function defaultWidth(title, index) {
  if (title === "notes") return 600;
  if (index === 0) return 350;
  return DEFAULT_COLUMN_WIDTH;
}

function columnIcon(type) {
  if (type === "boolean") return GridColumnIcon.HeaderBoolean;
  if (type === "number" || type === "integer") return GridColumnIcon.HeaderNumber;
  return GridColumnIcon.HeaderString;
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
  const [page, setPage] = useState(0);
  const editableColumns = model.get("editable_columns");
  const wrappedColumns = model.get("wrapped_columns");
  const fieldTypes = model.get("field_types") || {};
  const maxRowHeight = model.get("max_row_height");
  const pagination = model.get("pagination");
  const pageSize = model.get("page_size");
  const columnSizingMode = model.get("column_sizing_mode");
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageOffset = pagination ? page * pageSize : 0;
  const displayRows = pagination ? rows.slice(pageOffset, pageOffset + pageSize) : rows;

  const theme = useMemo(() => ({
    accentColor: "#2563eb",
    accentFg: "#ffffff",
    accentLight: "#dbeafe",
    bgCell: "#ffffff",
    bgCellMedium: "#fafafa",
    bgHeader: "#f8f8fa",
    bgHeaderHasFocus: "#f1f5f9",
    bgHeaderHovered: "#f1f5f9",
    borderColor: "#e4e4e7",
    drilldownBorder: "#d4d4d8",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    headerFontStyle: "600 14px ui-sans-serif, system-ui, sans-serif",
    linkColor: "#2563eb",
    textBubble: "#e4e4e7",
    textDark: "#3f3f46",
    textHeader: "#3f3f46",
    textLight: "#a1a1aa",
    textMedium: "#71717a",
  }), []);

  useEffect(() => {
    const sync = () => {
      setRows(model.get("data") || []);
      setPage(0);
    };
    model.on("change:data", sync);
    return () => model.off("change:data", sync);
  }, [model]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  const columns = useMemo(() => Object.keys(rows[0] || {}).map((title, index) => ({
    id: title,
    title,
    width: widths[title] ?? (columnSizingMode === "auto"
      ? Math.min(600, Math.max(120, 28 + Math.max(title.length, ...rows.slice(0, 100).map((row) => String(row[title] ?? "").length)) * 7.5))
      : columnSizingMode === "fit" ? Math.max(120, Math.floor(800 / Math.max(1, Object.keys(rows[0] || {}).length)))
        : defaultWidth(title, index)),
    hasMenu: true,
    icon: columnIcon(fieldTypes[title]),
    overlayIcon: !isEditable(title, editableColumns) ? GridColumnIcon.ProtectedColumnOverlay : undefined,
    kind: fieldTypes[title] === "boolean" ? GridCellKind.Boolean : fieldTypes[title] === "number" || fieldTypes[title] === "integer" ? GridCellKind.Number : GridCellKind.Text,
  })), [columnSizingMode, editableColumns, fieldTypes, rows, widths]);

  const commit = useCallback((cell, nextCell) => {
    const [columnIndex, rowIndex] = cell;
    const column = columns[columnIndex];
    if (!column || !isEditable(column.title, editableColumns)) return;
    const nextRows = rows.map((row, index) => index === rowIndex + pageOffset
      ? { ...row, [column.title]: coerce(nextCell.data, fieldTypes[column.title]) }
      : row);
    setRows(nextRows);
    model.set("value", nextRows);
    model.save_changes();
  }, [columns, editableColumns, fieldTypes, model, pageOffset, rows]);

  const getCellContent = useCallback(([columnIndex, rowIndex]) => {
    const column = columns[columnIndex];
    const value = displayRows[rowIndex]?.[column.title];
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
  }, [columns, displayRows, editableColumns, wrappedColumns]);

  const onColumnResize = useCallback((column, width) => {
    const nextWidths = { ...widths, [column.title]: width };
    setWidths(nextWidths);
    if (!isWrapped(column.title, wrappedColumns)) return;
    const { start, end } = visibleRowsRef.current;
    const sampleStart = Math.max(0, start - WINDOW_BUFFER);
    const sampleEnd = Math.min(displayRows.length - 1, end + WINDOW_BUFFER);
    const sampled = sampleHeight(displayRows, columns, wrappedColumns, nextWidths, sampleStart, sampleEnd, maxRowHeight);
    // The rough branch only changes a bounded window while the pointer moves.
    setRoughHeights({ mode: "window", start: sampleStart, end: sampleEnd, height: sampled });
    resizeRef.current = { height: sampled };
  }, [columns, displayRows, maxRowHeight, widths, wrappedColumns]);

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
    if (row >= displayRows.length || !roughHeights) return DEFAULT_ROW_HEIGHT;
    if (roughHeights.mode === "all") return roughHeights.height;
    return row >= roughHeights.start && row <= roughHeights.end ? roughHeights.height : DEFAULT_ROW_HEIGHT;
  }, [displayRows.length, roughHeights]);

  return <div aria-label={model.get("label")} className="lumut-glide" style={{ width: model.get("width") }}>
    {model.get("label") && <div className="lumut-glide-label">{model.get("label")}</div>}
    <DataEditor
      ref={editorRef}
      columns={columns}
      getCellContent={getCellContent}
      height={model.get("height")}
      width="100%"
      rows={displayRows.length}
      rowHeight={rowHeight}
      headerHeight={56}
      minColumnWidth={100}
      rowMarkers={{ kind: "number", width: 64 }}
      rowMarkerWidth={64}
      theme={theme}
      cellActivationBehavior="double-click"
      onCellEdited={commit}
      onColumnResize={onColumnResize}
      onVisibleRegionChanged={(range) => {
        visibleRowsRef.current = {
          start: Math.max(0, range.y),
          end: Math.max(0, range.y + Math.max(0, range.height - 1)),
        };
      }}
    />
    {pagination && <div className="lumut-glide-pagination"><button disabled={page === 0} onClick={() => setPage(page - 1)} type="button">Previous</button><span>{page + 1} / {pageCount}</span><button disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)} type="button">Next</button></div>}
  </div>;
}

const STYLE = `
${glideStyles}
.lumut-glide { border: 1px solid #1f2937; border-radius: 8px; overflow: hidden; }
.lumut-glide-label { border-bottom: 1px solid #1f2937; color: #111827; font: 600 18px/1.3 ui-sans-serif, system-ui, sans-serif; padding: 16px 24px; }
.lumut-glide .gdg-wmyidgi { font: 16px/1.45 ui-sans-serif, system-ui, sans-serif; }
.lumut-glide-pagination { border-top: 1px solid #e4e4e7; display: flex; gap: 8px; justify-content: flex-end; padding: 7px; }
.lumut-glide-pagination button { background: transparent; border: 1px solid #d4d4d8; border-radius: 4px; color: inherit; cursor: pointer; font: inherit; padding: 3px 8px; }
.lumut-glide-pagination button:disabled { cursor: not-allowed; opacity: .45; }
@media (prefers-color-scheme: dark) { .lumut-glide { border-color: #d1d5db; } .lumut-glide-label { border-color: #d1d5db; color: #f3f4f6; } }
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
