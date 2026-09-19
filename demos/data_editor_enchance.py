# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "lumut @ git+https://github.com/banditelol/lumut.git",
#   "marimo",
# ]
# ///

import marimo

from lumut import data_editor_enchance

app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo

    return (mo,)


@app.cell
def _(mo):
    editor = mo.ui.anywidget(
        data_editor_enchance(
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
