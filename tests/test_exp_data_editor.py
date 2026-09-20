import pytest

from lumut import (
    DataEditorEnhance,
    ExpDataEditor,
    data_editor_enhance,
    exp_data_editor,
)


def test_row_oriented_data_syncs_as_value() -> None:
    widget = exp_data_editor([{"name": "Ada", "score": 4}])

    assert isinstance(widget, ExpDataEditor)
    assert widget.data == [{"name": "Ada", "score": 4}]
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
