# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "lumut>=0.1.0",
#   "marimo",
# ]
# ///

import marimo

__generated_with = "0.23.0"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    from lumut import data_editor_enhance

    return data_editor_enhance, mo


@app.cell
def _(data_editor_enhance, mo):
    editor = mo.ui.anywidget(
        data_editor_enhance(
            [
                {
                    "name": "Ada Lovelace",
                    "notes": "This wrapped text uses the Glide rough resize experiment. Resize this column to sample its local visible rows.",
                    "active": True,
                },
                {
                    "name": "Grace Hopper",
                    "notes": "It is deliberately approximate: the sampled maximum is applied globally once resizing ends.",
                    "active": False,
                },
            ],
            label="Glide rough wrap sizing",
            editable_columns=["notes", "active"],
            wrapped_columns=["notes"],
            max_row_height=160,
        )
    )
    editor
    return (editor,)


@app.cell
def _(editor):
    editor.value
    return


if __name__ == "__main__":
    app.run()
