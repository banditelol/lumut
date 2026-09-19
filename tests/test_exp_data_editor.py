import pytest

from lumut import (
    DataEditorEnchance,
    ExpDataEditor,
    data_editor_enchance,
    exp_data_editor,
)


def test_row_oriented_data_syncs_as_value() -> None:
    widget = exp_data_editor([{"name": "Ada", "score": 4}])

    assert isinstance(widget, ExpDataEditor)
    assert widget.data == [{"name": "Ada", "score": 4}]
    assert widget.value == [{"name": "Ada", "score": 4}]
    assert widget.field_types == {"name": "string", "score": "integer"}


def test_column_oriented_data_is_normalized() -> None:
    widget = ExpDataEditor({"name": ["Ada", "Grace"], "active": [True, False]})

    assert widget.data == [
        {"name": "Ada", "active": True},
        {"name": "Grace", "active": False},
    ]
    assert widget.field_types["active"] == "boolean"


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
    widget = data_editor_enchance(
        {"name": ["Ada"], "notes": ["Wrapped"]},
        editable_columns=["notes"],
        wrapped_columns=["notes"],
    )

    assert isinstance(widget, DataEditorEnchance)
    assert widget.data == [{"name": "Ada", "notes": "Wrapped"}]
    assert widget.value == [{"name": "Ada", "notes": "Wrapped"}]
    assert widget.wrapped_columns == ["notes"]
    assert widget.wrapped_row_height_strategy == "approxIncrementalRough"
