import pytest

from lumut import (
    RemotePageSource,
    DataEditorEnhance,
    ExpDataEditor,
    data_editor_enhance,
    exp_data_editor,
)


def test_row_oriented_data_syncs_as_value() -> None:
    widget = exp_data_editor([{"name": "Ada", "score": 4}])

    assert isinstance(widget, ExpDataEditor)
    assert widget.data == [{"name": "Ada", "score": 4}]
    assert widget.initial_rows == [{"name": "Ada", "score": 4}]
    assert widget.value == [{"name": "Ada", "score": 4}]
    assert widget.field_types == {"name": "string", "score": "integer"}
    assert widget.wrap_text is True
    assert widget.auto_row_height is True


def test_text_wrapping_and_auto_height_can_be_controlled_independently() -> None:
    widget = exp_data_editor(
        [{"name": "Ada", "notes": "Long text"}],
        wrapped_columns=["notes"],
        wrap_text=False,
        auto_row_height=False,
    )

    assert widget.wrapped_columns == ["notes"]
    assert widget.wrap_text is False
    assert widget.auto_row_height is False


def test_column_oriented_data_is_normalized() -> None:
    widget = ExpDataEditor({"name": ["Ada", "Grace"], "active": [True, False]})

    assert widget.data == [
        {"name": "Ada", "active": True},
        {"name": "Grace", "active": False},
    ]
    assert widget.field_types["active"] == "boolean"


@pytest.mark.parametrize("factory", [exp_data_editor, data_editor_enhance])
def test_scalar_data_uses_marimos_value_column(factory: object) -> None:
    widget = factory(["Ada", "Grace"])  # type: ignore[operator]

    assert widget.data == [{"value": "Ada"}, {"value": "Grace"}]
    assert widget.value == [{"value": "Ada"}, {"value": "Grace"}]


@pytest.mark.parametrize("factory", [exp_data_editor, data_editor_enhance])
def test_marimo_data_editor_options_and_callback(factory: object) -> None:
    changes: list[list[dict[str, object]]] = []
    widget = factory(  # type: ignore[operator]
        [{"name": "Ada"}],
        column_sizing_mode="fit",
        pagination=True,
        page_size=10,
        on_change=changes.append,
    )

    widget.value = [{"name": "Grace"}]

    assert widget.column_sizing_mode == "fit"
    assert widget.pagination is True
    assert widget.page_size == 10
    assert changes == [[{"name": "Grace"}]]


def test_polars_style_dataframe_is_normalized() -> None:
    class PolarsLike:
        def to_dicts(self) -> list[dict[str, object]]:
            return [{"name": "Ada"}]

    widget = ExpDataEditor(PolarsLike())

    assert widget.value == [{"name": "Ada"}]


def test_invalid_configuration_is_rejected() -> None:
    with pytest.raises(ValueError, match="unknown columns"):
        ExpDataEditor([{"name": "Ada"}], editable_columns=["missing"])

    with pytest.raises(ValueError, match="at least"):
        ExpDataEditor([{"name": "Ada"}], max_row_height=20)


def test_compact_patches_materialize_value_without_mutating_data() -> None:
    changes: list[list[dict[str, object]]] = []
    widget = exp_data_editor([{"name": "Ada", "score": 4}], on_change=changes.append)

    widget.patches = [{"op": "set", "row": 0, "column": "score", "value": 5}]

    assert widget.data == [{"name": "Ada", "score": 4}]
    assert widget.value == [{"name": "Ada", "score": 5}]
    assert changes == [[{"name": "Ada", "score": 5}]]
    assert widget.trait_metadata("value", "sync") is False

    widget.patches = [{"id": 2, "op": "add_column", "name": "active", "default": False}]
    widget.patches = [{"id": 3, "op": "append", "row": {"name": "Grace", "score": 3, "active": True}}]
    widget.patches = [{"id": 4, "op": "delete", "row": 1}]

    assert widget.value == [{"name": "Ada", "score": 5, "active": False}]
    assert len(changes) == 4


def test_server_pagination_sends_only_the_initial_page() -> None:
    class Source:
        rows = [{"id": index, "name": f"row-{index}"} for index in range(80)]
        patches: list[dict[str, object]] = []

        def count(self) -> int:
            return len(self.rows)

        def page(self, *, offset: int, limit: int) -> list[dict[str, object]]:
            return self.rows[offset:offset + limit]

        def apply_patch(self, patch: dict[str, object]) -> bool:
            self.patches.append(patch)
            return True

    source = Source()
    widget = exp_data_editor(source=source, pagination="server", page_size=10)

    assert widget.data == []
    assert widget.row_count == 80
    assert widget.page_rows == source.rows[:10]
    widget.page_request = {"id": 1, "page": 2, "page_size": 25}
    assert widget.page_rows == source.rows[50:75]
    widget.patches = [{"id": 2, "op": "set", "row": 51, "column": "name", "value": "edited"}]
    assert source.patches[0]["op"] == "set"


def test_remote_pagination_transports_schema_not_rows() -> None:
    source = RemotePageSource("https://example.test/rows", row_count=1_000_000, columns=["id", "name"])
    widget = exp_data_editor(source=source, pagination="remote")

    assert widget.data == []
    assert widget.page_rows == []
    assert widget.row_count == 1_000_000
    assert widget.columns == ["id", "name"]
    assert widget.remote_url == "https://example.test/rows"


def test_large_eager_data_warns_about_browser_memory() -> None:
    with pytest.warns(RuntimeWarning, match="eager data"):
        exp_data_editor([{"value": index} for index in range(50_001)])


def test_glide_rough_editor_uses_the_same_eager_data_contract() -> None:
    widget = data_editor_enhance(
        {"name": ["Ada"], "notes": ["Wrapped"]},
        editable_columns=["notes"],
        wrapped_columns=["notes"],
    )

    assert isinstance(widget, DataEditorEnhance)
    assert widget.data == [{"name": "Ada", "notes": "Wrapped"}]
    assert widget.value == [{"name": "Ada", "notes": "Wrapped"}]
    assert widget.wrapped_columns == ["notes"]
    assert widget.wrapped_row_height_strategy == "approxIncrementalRough"
