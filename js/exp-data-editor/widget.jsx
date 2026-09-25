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
  const [scrollElement, setScrollElement] = useState(null);
  const rowElements = useRef(new Map());
  const patchSequence = useRef(0);
  const paginationMode = model.get("pagination_mode") || "none";
  const isPaginated = paginationMode !== "none";
  const [rows, setRows] = useState(() => {
    const initial = (paginationMode === "client" || paginationMode === "none")
      ? model.get("initial_rows")
      : model.get("page_rows");
    return (initial && initial.length ? initial : model.get("page_rows") || []).map((row) => ({ ...row }));
  });
  const [, setRevision] = useState(0);
  const [editing, setEditing] = useState(null);
  const [selection, setSelection] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);
  const [focusTarget, setFocusTarget] = useState(null);
  const [page, setPage] = useState(0);
  const [menu, setMenu] = useState(null);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState("string");
  const [columnDefaults, setColumnDefaults] = useState({});
  const editableColumns = model.get("editable_columns");
  const wrappedColumns = model.get("wrapped_columns");
  const wrapText = model.get("wrap_text");
  const autoRowHeight = model.get("auto_row_height");
  const fieldTypes = model.get("field_types") || {};
  const maxRowHeight = model.get("max_row_height");
  const estimatedRowHeight = model.get("estimated_row_height");
  const [pageSize, setPageSize] = useState(() => model.get("page_size"));
  const [rowCount, setRowCount] = useState(() => model.get("row_count") || 0);
  const pageSizeOptions = model.get("page_size_options") || [5, 10, 25, 50, 100];
  const remoteUrl = model.get("remote_url");
  const remotePatchUrl = model.get("remote_patch_url");
  const columnSizingMode = model.get("column_sizing_mode");
  const editorHeight = model.get("height") || 450;

  const pageCount = Math.max(1, Math.ceil((isPaginated ? rowCount : rows.length) / pageSize));
  const pageOffset = isPaginated ? page * pageSize : 0;
  const displayRows = paginationMode === "client" ? rows.slice(pageOffset, pageOffset + pageSize) : rows;

  useEffect(() => {
    const sync = () => {
      if (paginationMode !== "client" && paginationMode !== "none") return;
      const nextRows = (model.get("initial_rows") || []).map((row) => ({ ...row }));
      setRows(nextRows);
      setColumnNames(Object.keys(nextRows[0] || {}));
      setPage(0);
      setSelection(null);
      setSelectedRows([]);
      setColumnDefaults({});
      setRowCount(nextRows.length);
    };
    sync();
    const syncFirstPage = () => {
      if (rows.length === 0) setRows((model.get("page_rows") || []).map((row) => ({ ...row })));
    };
    syncFirstPage();
    model.on("change:page_rows", syncFirstPage);
    model.on("change:initial_rows", sync);
    return () => {
      model.off("change:page_rows", syncFirstPage);
      model.off("change:initial_rows", sync);
    };
  }, [model, paginationMode, rows.length]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    if (paginationMode !== "server") return undefined;
    const syncPage = () => setRows((model.get("page_rows") || []).map((row) => ({ ...row })));
    syncPage();
    model.on("change:page_rows", syncPage);
    return () => model.off("change:page_rows", syncPage);
  }, [model, paginationMode]);

  useEffect(() => {
    if (paginationMode !== "remote" || !remoteUrl) return undefined;
    const controller = new AbortController();
    const url = new URL(remoteUrl, window.location.href);
    url.searchParams.set("offset", String(page * pageSize));
    url.searchParams.set("limit", String(pageSize));
    fetch(url, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("page request failed")))
      .then((payload) => {
        const nextRows = Array.isArray(payload) ? payload : payload.rows || [];
        setRows(nextRows.map((row) => ({ ...row })));
        if (!Array.isArray(payload) && Number.isInteger(payload.row_count)) setRowCount(payload.row_count);
      })
      .catch((error) => { if (error.name !== "AbortError") console.error(error); });
    return () => controller.abort();
  }, [page, pageSize, paginationMode, remoteUrl]);

  const [columnNames, setColumnNames] = useState(() => Object.keys(rows[0] || {}).length ? Object.keys(rows[0]) : model.get("columns") || []);
  const sendPatches = useCallback((patches) => {
    const identified = patches.map((patch) => ({ ...patch, id: ++patchSequence.current }));
    if (paginationMode === "remote") {
      fetch(remotePatchUrl, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patches: identified }),
      }).catch((error) => console.error(error));
      return;
    }
    model.set("patches", identified);
    model.save_changes();
  }, [model, paginationMode, remotePatchUrl]);
  const commit = useCallback((rowIndex, columnId, rawValue) => {
    const sourceIndex = rowIndex + pageOffset;
    const nextValue = coerce(rawValue, fieldTypes[columnId]);
    rows[rowIndex][columnId] = nextValue;
    setEditing(null);
    setFocusTarget({ row: sourceIndex + 1, column: columnNames.indexOf(columnId), edit: false });
    sendPatches([{ op: "set", row: sourceIndex, column: columnId, value: nextValue }]);
    setRevision((revision) => revision + 1);
  }, [columnNames, fieldTypes, pageOffset, rows, sendPatches]);

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
  }, []);

  const addRow = useCallback(({ column = 0, draft, edit = false } = {}) => {
    const blank = Object.fromEntries(columnNames.map((column) => [
      column,
      fieldTypes[column] === "boolean" ? false : fieldTypes[column] === "number" || fieldTypes[column] === "integer" ? 0 : "",
    ]));
    saveRows([...rows, blank]);
    sendPatches([{ op: "append", row: blank }]);
    setFocusTarget({ row: rows.length, column, draft, edit });
  }, [columnNames, fieldTypes, rows, saveRows, sendPatches]);

  const deleteSelectedRows = useCallback(() => {
    if (selectedRows.length === 0) return;
    const selected = new Set(selectedRows);
    saveRows(rows.filter((_, index) => !selected.has(index)));
    sendPatches([...selectedRows].sort((left, right) => right - left).map((row) => ({ op: "delete", row })));
    setSelectedRows([]);
    setSelection(null);
  }, [rows, saveRows, selectedRows, sendPatches]);

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
    model.set("field_types", { ...fieldTypes, [name]: newColumnType });
    setColumnDefaults((current) => ({ ...current, [name]: defaultValue }));
    sendPatches([{ op: "add_column", name, default: defaultValue }]);
    setNewColumnName("");
    setNewColumnType("string");
    setMenu(null);
  }, [columnNames, fieldTypes, menu, newColumnName, newColumnType, sendPatches]);

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
      const value = Object.hasOwn(row.original, column) ? row.original[column] : columnDefaults[column];
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
  })), [columnDefaults, columnNames, columnSizingMode, commit, editableColumns, fieldTypes, openEdit, rows, wrapText, wrappedColumns]);

  const table = useReactTable({
    data: displayRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
  });
  const hasTrailingRow = true;
  const virtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => estimatedRowHeight,
    measureElement: (element) => autoRowHeight ? Math.min(
      maxRowHeight,
      Math.max(estimatedRowHeight, element.getBoundingClientRect().height),
    ) : estimatedRowHeight,
    overscan: 8,
  });
  const columnSizing = table.getState().columnSizing;
  const virtualItems = virtualizer.getVirtualItems();
  const renderedItems = virtualItems.length > 0
    ? virtualItems
    : table.getRowModel().rows.slice(0, Math.min(pageSize, 100)).map((_, index) => ({
      index,
      start: index * estimatedRowHeight,
    }));
  const totalVirtualHeight = virtualizer.getTotalSize() || table.getRowModel().rows.length * estimatedRowHeight;
  const measureRow = useCallback((index, element) => {
    if (!element) {
      rowElements.current.delete(index);
      return;
    }
    rowElements.current.set(index, element);
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
    const targetPage = isPaginated ? Math.floor(focusTarget.row / pageSize) : 0;
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
    }, [columnNames, displayRows.length, focusTarget, openEdit, page, pageOffset, pageSize, isPaginated, virtualizer]);

  const requestPage = useCallback((nextPage, nextPageSize = pageSize) => {
    const bounded = Math.max(0, Math.min(pageCount - 1, nextPage));
    setPage(bounded);
    if (paginationMode === "server") {
      model.set("page_request", { id: ++patchSequence.current, page: bounded, page_size: nextPageSize });
      model.save_changes();
    }
  }, [model, pageCount, pageSize, paginationMode]);

  const changePageSize = useCallback((event) => {
    const nextSize = Number(event.target.value);
    setPageSize(nextSize);
    requestPage(0, nextSize);
  }, [requestPage]);

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
    "--lumut-height": `${editorHeight}px`,
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
    <div className="lumut-scroll" ref={setScrollElement}>
      <div className="lumut-virtual-space" style={{ height: totalVirtualHeight }}>
        {renderedItems.map((virtualRow) => {
          const row = table.getRowModel().rows[virtualRow.index];
          const sourceRow = row.index + pageOffset;
          return <div
            className="lumut-row"
            data-index={virtualRow.index}
            key={row.id}
            ref={autoRowHeight ? (element) => measureRow(virtualRow.index, element) : undefined}
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
    <div className="lumut-row-actions"><button className="lumut-delete-rows" disabled={selectedRows.length === 0} onClick={deleteSelectedRows} type="button">Delete row{selectedRows.length === 1 ? "" : "s"}</button>{isPaginated && <span className="lumut-pagination"><select aria-label="Rows per page" value={pageSize} onChange={changePageSize}>{pageSizeOptions.map((size) => <option key={size} value={size}>{size} / page</option>)}</select><button aria-label="First page" disabled={page === 0} onClick={() => requestPage(0)} type="button">«</button><button aria-label="Previous page" disabled={page === 0} onClick={() => requestPage(page - 1)} type="button">‹</button><span>Page <input aria-label="Page" min="1" max={pageCount} onChange={(event) => requestPage(Number(event.target.value) - 1)} type="number" value={page + 1} /> of {pageCount}</span><button aria-label="Next page" disabled={page >= pageCount - 1} onClick={() => requestPage(page + 1)} type="button">›</button><button aria-label="Last page" disabled={page >= pageCount - 1} onClick={() => requestPage(pageCount - 1)} type="button">»</button></span>}</div>
  </div>;
}

const STYLE = `
.lumut-editor { --lumut-border: var(--border, #e4e4e7); --lumut-bg: var(--background, #fff); --lumut-fg: var(--foreground, #27272a); --lumut-muted: var(--muted-foreground, #71717a); --lumut-hover: var(--muted, #fafafa); --lumut-accent: var(--primary, #6366f1); color: var(--lumut-fg); background: var(--lumut-bg); border: 1px solid var(--lumut-border); border-radius: 8px; font: 14px/1.45 ui-sans-serif, system-ui, sans-serif; overflow: visible; position: relative; }
.lumut-label { padding: 12px 16px; border-bottom: 1px solid var(--lumut-border); font-size: 15px; font-weight: 600; }
.lumut-header, .lumut-row, .lumut-frozen-new-row { display: grid; min-width: max-content; }
.lumut-header { background: var(--muted, #fafafa); border-bottom: 1px solid var(--lumut-border); position: relative; z-index: 1; }
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
.lumut-new-row { background: var(--muted, #fafafa); }
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
