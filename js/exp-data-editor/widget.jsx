import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

function isSelected(selection, row, column) {
  if (!selection) return false;
  const top = Math.min(selection.anchor.row, selection.focus.row);
  const bottom = Math.max(selection.anchor.row, selection.focus.row);
  const left = Math.min(selection.anchor.column, selection.focus.column);
  const right = Math.max(selection.anchor.column, selection.focus.column);
  return row >= top && row <= bottom && column >= left && column <= right;
}

function EditTextarea({ value, selectAll, style, onCommit, onCancel }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${Math.min(style.maxHeight, Math.max(42, ref.current.scrollHeight))}px`;
    ref.current.focus();
    if (selectAll) ref.current.select();
  }, [selectAll]);
  return <textarea
    ref={ref}
    className="lumut-editor-textarea"
    defaultValue={value ?? ""}
    style={style}
    onBlur={(event) => onCommit(event.target.value)}
    onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        event.currentTarget.blur();
      }
    }}
  />;
}

function Editor({ model, overlayRoot }) {
  const editorRootRef = useRef(null);
  const scrollRef = useRef(null);
  const rowElements = useRef(new Map());
  const [rows, setRows] = useState(() => model.get("value") || model.get("data") || []);
  const [editing, setEditing] = useState(null);
  const [selection, setSelection] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);
  const [focusTarget, setFocusTarget] = useState(null);
  const [page, setPage] = useState(0);
  const [menu, setMenu] = useState(null);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState("string");
  const editableColumns = model.get("editable_columns");
  const wrappedColumns = model.get("wrapped_columns");
  const wrapText = model.get("wrap_text");
  const autoRowHeight = model.get("auto_row_height");
  const fieldTypes = model.get("field_types") || {};
  const maxRowHeight = model.get("max_row_height");
  const estimatedRowHeight = model.get("estimated_row_height");
  const pagination = model.get("pagination");
  const pageSize = model.get("page_size");
  const columnSizingMode = model.get("column_sizing_mode");

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageOffset = pagination ? page * pageSize : 0;
  const displayRows = pagination ? rows.slice(pageOffset, pageOffset + pageSize) : rows;

  useEffect(() => {
    const sync = () => {
      const nextRows = model.get("data") || [];
      setRows(nextRows);
      setColumnNames(Object.keys(nextRows[0] || {}));
      setPage(0);
      setSelection(null);
      setSelectedRows([]);
    };
    model.on("change:data", sync);
    return () => model.off("change:data", sync);
  }, [model]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  const [columnNames, setColumnNames] = useState(() => Object.keys(rows[0] || {}));
  const commit = useCallback((rowIndex, columnId, rawValue) => {
    const sourceIndex = rowIndex + pageOffset;
    const next = rows.map((row, index) =>
      index === sourceIndex
        ? { ...row, [columnId]: coerce(rawValue, fieldTypes[columnId]) }
        : row,
    );
    setRows(next);
    setEditing(null);
    setFocusTarget({ row: sourceIndex + 1, column: columnNames.indexOf(columnId), edit: false });
    model.set("value", next);
    model.save_changes();
  }, [columnNames, fieldTypes, model, pageOffset, rows]);

  const openEdit = useCallback((rowIndex, columnId, element, draft) => {
    const cell = element?.getBoundingClientRect();
    if (!cell) return;
    setEditing({
      rowIndex,
      columnId,
      draft,
      rect: {
        left: cell.left,
        top: cell.top,
        width: cell.width,
        maxHeight: Math.max(42, Math.min(360, window.innerHeight - cell.top - 16)),
      },
    });
  }, []);

  const saveRows = useCallback((nextRows) => {
    setRows(nextRows);
    model.set("value", nextRows);
    model.save_changes();
  }, [model]);

  const addRow = useCallback(({ column = 0, draft, edit = false } = {}) => {
    const blank = Object.fromEntries(columnNames.map((column) => [
      column,
      fieldTypes[column] === "boolean" ? false : fieldTypes[column] === "number" || fieldTypes[column] === "integer" ? 0 : "",
    ]));
    saveRows([...rows, blank]);
    setFocusTarget({ row: rows.length, column, draft, edit });
  }, [columnNames, fieldTypes, rows, saveRows]);

  const deleteSelectedRows = useCallback(() => {
    if (selectedRows.length === 0) return;
    const selected = new Set(selectedRows);
    saveRows(rows.filter((_, index) => !selected.has(index)));
    setSelectedRows([]);
    setSelection(null);
  }, [rows, saveRows, selectedRows]);

  const addColumn = useCallback((side) => {
    const name = newColumnName.trim();
    if (!name || columnNames.includes(name) || !menu) return;
    const index = columnNames.indexOf(menu.column);
    const insertionPoint = side === "left" ? index : index + 1;
    const nextColumns = [...columnNames];
    nextColumns.splice(insertionPoint, 0, name);
    setColumnNames(nextColumns);
    const defaultValue = newColumnType === "boolean" ? false
      : newColumnType === "number" || newColumnType === "integer" ? null : "";
    saveRows(rows.map((row) => ({ ...row, [name]: defaultValue })));
    model.set("field_types", { ...fieldTypes, [name]: newColumnType });
    model.save_changes();
    setNewColumnName("");
    setNewColumnType("string");
    setMenu(null);
  }, [columnNames, fieldTypes, menu, model, newColumnName, newColumnType, rows, saveRows]);

  const copyColumnName = useCallback(async (name) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(name).catch(() => undefined);
    } else {
      const input = document.createElement("textarea");
      input.value = name;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setMenu(null);
  }, []);

  useEffect(() => {
    const stopDragging = () => setDragging(false);
    window.addEventListener("mouseup", stopDragging);
    return () => window.removeEventListener("mouseup", stopDragging);
  }, []);

  const columns = useMemo(() => columnNames.map((column, index) => ({
    accessorKey: column,
    header: column,
    size: columnSizingMode === "auto"
      ? Math.min(600, Math.max(120, 28 + Math.max(column.length, ...rows.slice(0, 100).map((row) => String(row[column] ?? "").length)) * 7.5))
      : columnSizingMode === "fit" ? Math.max(120, Math.floor(800 / Math.max(1, columnNames.length))) : 180,
    minSize: 80,
    maxSize: 600,
    enableResizing: true,
    cell: ({ getValue, row }) => {
      const value = getValue();
      const editable = isEditable(column, editableColumns);
      if (fieldTypes[column] === "boolean" && editable) {
        return <input
          aria-label={`${column}, row ${row.index + 1}`}
          checked={Boolean(value)}
          type="checkbox"
          onChange={(event) => commit(row.index, column, event.target.checked)}
        />;
      }
      return <div
        className={wrapText && isWrapped(column, wrappedColumns) ? "lumut-cell-content lumut-wrap" : "lumut-cell-content"}
        title={String(value ?? "")}
      >
        {String(value ?? "")}
      </div>;
    },
  })), [columnNames, columnSizingMode, commit, editableColumns, fieldTypes, openEdit, rows, wrapText, wrappedColumns]);

  const table = useReactTable({
    data: displayRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
  });
  const hasTrailingRow = true;
  const virtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRowHeight,
    measureElement: (element) => autoRowHeight ? Math.min(
      maxRowHeight,
      Math.max(estimatedRowHeight, element.getBoundingClientRect().height),
    ) : estimatedRowHeight,
    overscan: 8,
  });
  const columnSizing = table.getState().columnSizing;
  const measureRow = useCallback((element) => {
    if (!element) return;
    rowElements.current.set(Number(element.dataset.index), element);
    if (autoRowHeight) virtualizer.measureElement(element);
  }, [autoRowHeight, virtualizer]);

  // A resize changes line breaks. Measure the mounted rows after layout without
  // clearing their cached geometry; clearing on pointer release caused rows to
  // revert to estimates and overlap until the next scroll.
  useLayoutEffect(() => {
    if (!autoRowHeight) return undefined;
    const frame = requestAnimationFrame(() => {
      rowElements.current.forEach((element) => virtualizer.measureElement(element));
    });
    return () => cancelAnimationFrame(frame);
  }, [autoRowHeight, columnSizing, virtualizer]);

  useEffect(() => {
    if (!focusTarget) return undefined;
    const targetPage = pagination ? Math.floor(focusTarget.row / pageSize) : 0;
    if (targetPage !== page) {
      setPage(targetPage);
      return undefined;
    }
    const timer = requestAnimationFrame(() => {
      const localRow = focusTarget.row - pageOffset;
      if (localRow < displayRows.length) virtualizer.scrollToIndex(localRow, { align: "end" });
      requestAnimationFrame(() => {
        const cell = editorRootRef.current?.querySelector(`[data-row="${focusTarget.row}"][data-column="${focusTarget.column}"]`);
        if (!cell) return;
        cell.focus({ preventScroll: true });
        setSelection({ anchor: { row: focusTarget.row, column: focusTarget.column }, focus: { row: focusTarget.row, column: focusTarget.column } });
        if (focusTarget.edit) openEdit(localRow, columnNames[focusTarget.column], cell, focusTarget.draft);
        setFocusTarget(null);
      });
    });
    return () => cancelAnimationFrame(timer);
  }, [columnNames, displayRows.length, focusTarget, openEdit, page, pageOffset, pageSize, pagination, virtualizer]);

  const gridTemplateColumns = table.getVisibleLeafColumns()
    .map((column) => `${column.getSize()}px`)
    .join(" ");
  const fullGridTemplateColumns = `64px ${gridTemplateColumns}`;

  const moveSelection = useCallback((event, row, column) => {
    const deltas = {
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const delta = deltas[event.key];
    if (!delta) return false;
    event.preventDefault();
    event.stopPropagation();
    const minimumRow = pageOffset;
    const maximumRow = pageOffset + Math.max(0, displayRows.length - 1) + (hasTrailingRow ? 1 : 0);
    const base = selection?.focus ?? { row, column };
    const next = {
      row: Math.max(minimumRow, Math.min(maximumRow, base.row + delta[0])),
      column: Math.max(0, Math.min(columnNames.length - 1, base.column + delta[1])),
    };
    setSelection(event.shiftKey
      ? { anchor: selection?.anchor ?? { row, column }, focus: next }
      : { anchor: next, focus: next });
    setFocusTarget({ row: next.row, column: next.column, edit: false });
    return true;
  }, [columnNames.length, displayRows.length, hasTrailingRow, pageOffset, selection]);

  return <div className="lumut-editor" ref={editorRootRef} style={{
    "--lumut-height": `${model.get("height")}px`,
    "--lumut-max-row-height": `${maxRowHeight}px`,
    width: model.get("width"),
  }}>
    {model.get("label") && <div className="lumut-label">{model.get("label")}</div>}
    <div className="lumut-header" style={{ gridTemplateColumns: fullGridTemplateColumns }}>
      <div className="lumut-row-number-header" aria-label="Row selection" />
      {table.getHeaderGroups().map((headerGroup) => headerGroup.headers.map((header) => (
        <div className="lumut-header-cell" key={header.id}>
          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
          <button
            aria-label={`Column actions for ${header.column.id}`}
            className="lumut-column-menu-button"
            onClick={() => setMenu((current) => current?.column === header.column.id ? null : { column: header.column.id, stage: "root", side: null })}
            type="button"
          >⌄</button>
          <div
            aria-label={`Resize ${header.column.id}`}
            className={`lumut-resizer ${header.column.getIsResizing() ? "is-resizing" : ""}`}
            onDoubleClick={() => header.column.resetSize()}
            onMouseDown={header.getResizeHandler()}
            onTouchStart={header.getResizeHandler()}
          />
          {menu?.column === header.column.id && menu.stage === "root" && <div className="lumut-column-menu lumut-column-menu-root">
            <button onClick={() => copyColumnName(header.column.id)} type="button">▣&ensp;Copy column name</button>
            <button onClick={() => setMenu({ column: header.column.id, stage: "add", side: "left" })} type="button">＋&ensp;Add column to the left <span>›</span></button>
            <button onClick={() => setMenu({ column: header.column.id, stage: "add", side: "right" })} type="button">＋&ensp;Add column to the right <span>›</span></button>
          </div>}
          {menu?.column === header.column.id && menu.stage === "add" && <div className="lumut-column-menu lumut-add-column-menu">
            <label>Column name<input autoFocus placeholder="Enter column name" value={newColumnName} onChange={(event) => setNewColumnName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addColumn(menu.side)} /></label>
            <label>Data type<select value={newColumnType} onChange={(event) => setNewColumnType(event.target.value)}><option value="string">String</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="datetime">Datetime</option></select></label>
            <button className="lumut-add-column-button" disabled={!newColumnName.trim()} onClick={() => addColumn(menu.side)} type="button">Add column to the {menu.side}</button>
          </div>}
        </div>
      )))}
    </div>
    <div className="lumut-scroll" ref={scrollRef}>
      <div className="lumut-virtual-space" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = table.getRowModel().rows[virtualRow.index];
          const sourceRow = row.index + pageOffset;
          return <div
            className="lumut-row"
            data-index={virtualRow.index}
            key={row.id}
            ref={autoRowHeight ? measureRow : undefined}
            style={{ gridTemplateColumns: fullGridTemplateColumns, transform: `translateY(${virtualRow.start}px)` }}
          >
            <div className="lumut-row-selector"><label><input checked={selectedRows.includes(row.index + pageOffset)} onChange={() => setSelectedRows((current) => current.includes(row.index + pageOffset) ? current.filter((index) => index !== row.index + pageOffset) : [...current, row.index + pageOffset])} type="checkbox" /><span>{row.index + pageOffset + 1}</span></label></div>
            {row.getVisibleCells().map((cell, columnIndex) => <div
              className={`lumut-cell ${isSelected(selection, row.index + pageOffset, columnIndex) ? "is-selected" : ""}`}
              data-column={columnIndex}
              data-row={sourceRow}
              key={cell.id}
              tabIndex={0}
              onMouseDown={(event) => { if (event.button !== 0) return; event.currentTarget.focus({ preventScroll: true }); setDragging(true); setSelection({ anchor: { row: row.index + pageOffset, column: columnIndex }, focus: { row: row.index + pageOffset, column: columnIndex } }); }}
              onMouseEnter={() => dragging && setSelection((current) => current ? { ...current, focus: { row: row.index + pageOffset, column: columnIndex } } : current)}
              onDoubleClick={(event) => isEditable(cell.column.id, editableColumns) && openEdit(row.index, cell.column.id, event.currentTarget)}
              onKeyDown={(event) => {
                if (moveSelection(event, row.index + pageOffset, columnIndex)) return;
                if (!isEditable(cell.column.id, editableColumns)) return;
                if (event.key === "Enter") {
                  event.preventDefault();
                  openEdit(row.index, cell.column.id, event.currentTarget);
                } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
                  event.preventDefault();
                  openEdit(row.index, cell.column.id, event.currentTarget, event.key);
                }
              }}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </div>)}
          </div>;
        })}
      </div>
    </div>
    <div className="lumut-frozen-new-row lumut-new-row" style={{ gridTemplateColumns: fullGridTemplateColumns }}>
      <div className="lumut-row-selector" />
      {columnNames.map((column, columnIndex) => <div
        className={`lumut-cell ${isSelected(selection, rows.length, columnIndex) ? "is-selected" : ""}`}
        data-column={columnIndex}
        data-row={rows.length}
        key={column}
        tabIndex={0}
        onMouseDown={(event) => { if (event.button !== 0) return; event.currentTarget.focus({ preventScroll: true }); setDragging(true); setSelection({ anchor: { row: rows.length, column: columnIndex }, focus: { row: rows.length, column: columnIndex } }); }}
        onMouseEnter={() => dragging && setSelection((current) => current ? { ...current, focus: { row: rows.length, column: columnIndex } } : current)}
        onDoubleClick={() => addRow({ column: columnIndex, edit: true })}
        onKeyDown={(event) => {
          if (moveSelection(event, rows.length, columnIndex)) return;
          if (event.key === "Enter") { event.preventDefault(); addRow({ column: columnIndex, edit: true }); }
          else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); addRow({ column: columnIndex, draft: event.key, edit: true }); }
        }}
      >{columnIndex === 0 && <span className="lumut-new-row-label">＋ New row</span>}</div>)}
    </div>
    {editing && createPortal(<EditTextarea
      value={editing.draft ?? displayRows[editing.rowIndex]?.[editing.columnId]}
      selectAll={editing.draft == null}
      style={editing.rect}
      onCommit={(nextValue) => commit(editing.rowIndex, editing.columnId, nextValue)}
      onCancel={() => setEditing(null)}
    />, overlayRoot)}
    <div className="lumut-row-actions"><button className="lumut-delete-rows" disabled={selectedRows.length === 0} onClick={deleteSelectedRows} type="button">Delete row{selectedRows.length === 1 ? "" : "s"}</button>{pagination && <span className="lumut-pagination"><button disabled={page === 0} onClick={() => setPage(page - 1)} type="button">Previous</button><span>{page + 1} / {pageCount}</span><button disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)} type="button">Next</button></span>}</div>
  </div>;
}

const STYLE = `
.lumut-editor { --lumut-border: #e4e4e7; --lumut-bg: #fff; --lumut-fg: #27272a; --lumut-muted: #71717a; --lumut-hover: #fafafa; --lumut-accent: #6366f1; color: var(--lumut-fg); background: var(--lumut-bg); border: 1px solid var(--lumut-border); border-radius: 8px; font: 14px/1.45 ui-sans-serif, system-ui, sans-serif; overflow: visible; position: relative; }
.lumut-label { padding: 12px 16px; border-bottom: 1px solid var(--lumut-border); font-size: 15px; font-weight: 600; }
.lumut-header, .lumut-row, .lumut-frozen-new-row { display: grid; min-width: max-content; }
.lumut-header { background: #fafafa; border-bottom: 1px solid var(--lumut-border); position: relative; z-index: 1; }
.lumut-row-number-header, .lumut-row-selector { border-right: 1px solid var(--lumut-border); }
.lumut-header-cell { border-right: 1px solid var(--lumut-border); color: #3f3f46; font-size: 14px; font-weight: 600; letter-spacing: 0; overflow: visible; padding: 11px 28px 11px 14px; position: relative; text-overflow: ellipsis; text-transform: none; white-space: nowrap; }
.lumut-resizer { cursor: col-resize; height: 100%; position: absolute; right: 0; top: 0; touch-action: none; width: 10px; z-index: 2; }
.lumut-resizer::after { background: var(--lumut-muted); border-radius: 2px; content: ""; height: 22px; opacity: .45; position: absolute; right: 3px; top: calc(50% - 11px); transition: background .12s, opacity .12s; width: 2px; }
.lumut-resizer:hover::after, .lumut-resizer.is-resizing::after { background: #2563eb; opacity: 1; width: 3px; }
.lumut-column-menu-button { background: transparent; border: 0; color: var(--lumut-muted); cursor: pointer; font: 16px/1 sans-serif; padding: 2px; position: absolute; right: 11px; top: 8px; }
.lumut-column-menu { background: var(--lumut-bg); border: 1px solid var(--lumut-border); border-radius: 8px; box-shadow: 0 8px 20px #0002; display: grid; gap: 4px; min-width: 250px; padding: 8px; position: absolute; right: 0; text-transform: none; top: calc(100% + 2px); z-index: 5; }
.lumut-column-menu-root button { align-items: center; border: 0; display: flex; font-size: 14px; justify-content: space-between; padding: 10px; }
.lumut-column-menu-root button + button { border-top: 1px solid var(--lumut-border); }
.lumut-add-column-menu { left: auto; min-width: 290px; right: calc(100% + 6px); top: 0; }
.lumut-column-menu button, .lumut-row-actions button { background: var(--lumut-bg); border: 1px solid var(--lumut-border); border-radius: 4px; color: var(--lumut-fg); cursor: pointer; font: inherit; padding: 5px 8px; text-align: left; }
.lumut-column-menu button:hover, .lumut-row-actions button:hover:not(:disabled) { border-color: var(--lumut-accent); color: var(--lumut-accent); }
.lumut-column-menu label { color: var(--lumut-muted); display: grid; font-size: 11px; gap: 3px; }
.lumut-column-menu input, .lumut-column-menu select { border: 1px solid var(--lumut-border); border-radius: 5px; color: var(--lumut-fg); font: inherit; padding: 7px; }
.lumut-add-column-button { background: #8ab5ef !important; border: 0 !important; color: #fff !important; justify-content: center; text-align: center !important; }
.lumut-add-column-button:disabled { cursor: not-allowed; opacity: .5; }
.lumut-column-menu-actions { display: flex; gap: 5px; }
.lumut-scroll { height: var(--lumut-height); overflow: auto; }
.lumut-virtual-space { min-width: max-content; position: relative; }
.lumut-row { border-bottom: 1px solid var(--lumut-border); box-sizing: border-box; left: 0; max-height: var(--lumut-max-row-height); overflow: hidden; position: absolute; top: 0; width: 100%; }
.lumut-row:hover { background: var(--lumut-hover); }
.lumut-new-row { background: #fafafa; }
.lumut-frozen-new-row { border-top: 1px solid var(--lumut-border); border-bottom: 1px solid var(--lumut-border); }
.lumut-new-row-label { color: var(--lumut-muted); font-weight: 500; }
.lumut-row-selector { align-items: center; display: flex; justify-content: center; min-height: 34px; }
.lumut-row-selector label { cursor: pointer; display: grid; place-items: center; }
.lumut-row-selector input { grid-area: 1 / 1; height: 22px; margin: 0; opacity: 0; width: 22px; }
.lumut-row-selector span { color: #98a2b3; grid-area: 1 / 1; text-align: center; }
.lumut-row-selector input:checked + span { background: #4f63ff; border-radius: 5px; color: #fff; font-size: 0; height: 22px; width: 22px; }
.lumut-row-selector input:checked + span::after { content: "✓"; font-size: 17px; line-height: 22px; }
.lumut-cell { border-right: 1px solid var(--lumut-border); box-sizing: border-box; max-height: var(--lumut-max-row-height); min-height: 34px; overflow: hidden; padding: 7px ${CELL_PADDING}px; position: relative; user-select: none; }
.lumut-cell:focus { outline: none; }
.lumut-cell.is-selected { background: #eef2ff; box-shadow: inset 0 0 0 1px #818cf8; }
.lumut-cell-content { display: block; max-height: calc(var(--lumut-max-row-height) - 14px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lumut-wrap { overflow-wrap: anywhere; white-space: pre-wrap; }
.lumut-editor-textarea { background: var(--lumut-bg); border: 1px solid #818cf8; border-radius: 5px; box-shadow: 0 8px 20px #18181b26; box-sizing: border-box; color: var(--lumut-fg); font: 14px/1.45 ui-sans-serif, system-ui, sans-serif; min-height: 42px; outline: 2px solid #c7d2fe; outline-offset: 0; overflow: auto; padding: 8px 10px; position: fixed; resize: vertical; white-space: pre-wrap; z-index: 2147483647; }
.lumut-editor-textarea::selection { background: #c7d2fe; color: #27272a; }
.lumut-overlay-root { --lumut-bg: #fff; --lumut-fg: #27272a; inset: 0; pointer-events: none; position: fixed; z-index: 2147483646; }
.lumut-overlay-root .lumut-editor-textarea { pointer-events: auto; }
.lumut-row-actions { border-top: 1px solid var(--lumut-border); display: flex; gap: 8px; justify-content: flex-end; padding: 8px; }
.lumut-row-actions button:disabled { cursor: not-allowed; opacity: .45; }
.lumut-delete-rows { background: #ef4444 !important; border-color: #dc2626 !important; color: #fff !important; margin-left: auto; }
.lumut-pagination { align-items: center; display: flex; gap: 6px; margin-left: auto; }
@media (prefers-color-scheme: dark) { .lumut-editor { --lumut-border: #30363d; --lumut-bg: #161b22; --lumut-fg: #e6edf3; --lumut-muted: #8b949e; --lumut-hover: #21262d; } .lumut-header, .lumut-new-row { background: #1c2128; } .lumut-header-cell { color: #e6edf3; } .lumut-cell.is-selected { background: #27345f; box-shadow: inset 0 0 0 1px #8190ff; } .lumut-overlay-root { --lumut-bg: #161b22; --lumut-fg: #e6edf3; } .lumut-editor-textarea::selection { background: #3b4b82; color: #f8fafc; } }
`;

function render({ model, el }) {
  const style = document.createElement("style");
  style.textContent = STYLE;
  el.appendChild(style);
  const mount = document.createElement("div");
  const overlay = document.createElement("div");
  overlay.className = "lumut-overlay-root";
  el.appendChild(mount);
  el.appendChild(overlay);
  const root = createRoot(mount);
  root.render(<Editor model={model} overlayRoot={overlay} />);
  return () => {
    root.unmount();
    overlay.remove();
  };
}

export default { render };
