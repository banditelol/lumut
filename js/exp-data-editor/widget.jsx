import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";

const CELL_PADDING = 12;

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

function Editor({ model }) {
  const scrollRef = useRef(null);
  const [rows, setRows] = useState(() => model.get("value") || model.get("data") || []);
  const [editing, setEditing] = useState(null);
  const editableColumns = model.get("editable_columns");
  const wrappedColumns = model.get("wrapped_columns");
  const fieldTypes = model.get("field_types") || {};
  const maxRowHeight = model.get("max_row_height");
  const estimatedRowHeight = model.get("estimated_row_height");

  useEffect(() => {
    const sync = () => setRows(model.get("value") || model.get("data") || []);
    model.on("change:data", sync);
    return () => model.off("change:data", sync);
  }, [model]);

  const columnNames = useMemo(() => Object.keys(rows[0] || {}), [rows]);
  const commit = useCallback((rowIndex, columnId, rawValue) => {
    const next = rows.map((row, index) =>
      index === rowIndex
        ? { ...row, [columnId]: coerce(rawValue, fieldTypes[columnId]) }
        : row,
    );
    setRows(next);
    setEditing(null);
    model.set("value", next);
    model.save_changes();
  }, [fieldTypes, model, rows]);

  const columns = useMemo(() => columnNames.map((column) => ({
    accessorKey: column,
    header: column,
    size: 180,
    minSize: 80,
    maxSize: 600,
    enableResizing: true,
    cell: ({ getValue, row }) => {
      const value = getValue();
      const editable = isEditable(column, editableColumns);
      const active = editing?.rowIndex === row.index && editing.columnId === column;
      if (fieldTypes[column] === "boolean" && editable) {
        return <input
          aria-label={`${column}, row ${row.index + 1}`}
          checked={Boolean(value)}
          type="checkbox"
          onChange={(event) => commit(row.index, column, event.target.checked)}
        />;
      }
      if (active) {
        return <input
          autoFocus
          className="lumut-editor-input"
          defaultValue={value ?? ""}
          onBlur={(event) => commit(row.index, column, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setEditing(null);
          }}
        />;
      }
      return <div
        className={isWrapped(column, wrappedColumns) ? "lumut-cell-content lumut-wrap" : "lumut-cell-content"}
        title={String(value ?? "")}
        onDoubleClick={() => editable && setEditing({ rowIndex: row.index, columnId: column })}
      >
        {String(value ?? "")}
      </div>;
    },
  })), [columnNames, commit, editableColumns, editing, fieldTypes, wrappedColumns]);

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
  });
  const virtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRowHeight,
    measureElement: (element) => Math.min(
      maxRowHeight,
      Math.max(estimatedRowHeight, element.getBoundingClientRect().height),
    ),
    overscan: 8,
  });
  const columnSizing = table.getState().columnSizing;
  useEffect(() => virtualizer.measure(), [columnSizing, virtualizer]);

  const gridTemplateColumns = table.getVisibleLeafColumns()
    .map((column) => `${column.getSize()}px`)
    .join(" ");

  return <div className="lumut-editor" style={{
    "--lumut-height": `${model.get("height")}px`,
    "--lumut-max-row-height": `${maxRowHeight}px`,
    width: model.get("width"),
  }}>
    {model.get("label") && <div className="lumut-label">{model.get("label")}</div>}
    <div className="lumut-header" style={{ gridTemplateColumns }}>
      {table.getHeaderGroups().map((headerGroup) => headerGroup.headers.map((header) => (
        <div className="lumut-header-cell" key={header.id}>
          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
          <div
            aria-label={`Resize ${header.column.id}`}
            className={`lumut-resizer ${header.column.getIsResizing() ? "is-resizing" : ""}`}
            onDoubleClick={() => header.column.resetSize()}
            onMouseDown={header.getResizeHandler()}
            onTouchStart={header.getResizeHandler()}
          />
        </div>
      )))}
    </div>
    <div className="lumut-scroll" ref={scrollRef}>
      <div className="lumut-virtual-space" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = table.getRowModel().rows[virtualRow.index];
          return <div
            className="lumut-row"
            data-index={virtualRow.index}
            key={row.id}
            ref={virtualizer.measureElement}
            style={{ gridTemplateColumns, transform: `translateY(${virtualRow.start}px)` }}
          >
            {row.getVisibleCells().map((cell) => <div className="lumut-cell" key={cell.id}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </div>)}
          </div>;
        })}
      </div>
    </div>
  </div>;
}

const STYLE = `
.lumut-editor { --lumut-border: #d7dce3; --lumut-bg: #fff; --lumut-fg: #1f2937; --lumut-muted: #667085; --lumut-hover: #f8fafc; color: var(--lumut-fg); background: var(--lumut-bg); border: 1px solid var(--lumut-border); border-radius: 8px; font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; overflow: hidden; }
.lumut-label { padding: 8px 12px; border-bottom: 1px solid var(--lumut-border); font-weight: 600; }
.lumut-header, .lumut-row { display: grid; min-width: max-content; }
.lumut-header { background: #f8fafc; border-bottom: 1px solid var(--lumut-border); position: relative; z-index: 1; }
.lumut-header-cell { color: var(--lumut-muted); font-size: 11px; font-weight: 600; letter-spacing: .03em; overflow: hidden; padding: 9px 12px; position: relative; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
.lumut-resizer { cursor: col-resize; height: 100%; position: absolute; right: -3px; top: 0; touch-action: none; width: 6px; z-index: 2; }
.lumut-resizer:hover, .lumut-resizer.is-resizing { background: #60a5fa; }
.lumut-scroll { height: var(--lumut-height); overflow: auto; }
.lumut-virtual-space { min-width: max-content; position: relative; }
.lumut-row { border-bottom: 1px solid var(--lumut-border); box-sizing: border-box; left: 0; max-height: var(--lumut-max-row-height); overflow: hidden; position: absolute; top: 0; width: 100%; }
.lumut-row:hover { background: var(--lumut-hover); }
.lumut-cell { box-sizing: border-box; min-height: 34px; overflow: hidden; padding: 7px ${CELL_PADDING}px; }
.lumut-cell-content { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lumut-wrap { overflow-wrap: anywhere; white-space: pre-wrap; }
.lumut-editor-input { background: transparent; border: 1px solid #60a5fa; border-radius: 3px; box-sizing: border-box; color: inherit; font: inherit; outline: none; padding: 2px 4px; width: 100%; }
@media (prefers-color-scheme: dark) { .lumut-editor { --lumut-border: #30363d; --lumut-bg: #161b22; --lumut-fg: #e6edf3; --lumut-muted: #8b949e; --lumut-hover: #21262d; } .lumut-header { background: #1c2128; } }
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

