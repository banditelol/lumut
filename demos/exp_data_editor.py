# /// script
# requires-python = ">=3.11"
# dependencies = ["anywidget>=0.11", "marimo>=0.23", "lumut @ git+https://github.com/banditelol/lumut.git"]
# ///

import marimo

__generated_with = "0.23.0"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo

    from lumut import exp_data_editor

    return exp_data_editor, mo


@app.cell
def _(exp_data_editor, mo):
    editor = mo.ui.anywidget(
        exp_data_editor(
            [
                {
                    "name": "Ada Lovelace",
                    "role": "Mathematician",
                    "notes": "Long text wraps and is measured only when this row enters the viewport. Drag the Notes header boundary to exercise resize-aware row measurement.",
                },
                {
                    "name": "Grace Hopper",
                    "role": "Computer scientist",
                    "notes": "Rows have a maximum height, so unusually long values cannot dominate scroll geometry.",
                },
            ],
            label="Experimental data editor",
            editable_columns=["role", "notes"],
            max_row_height=120,
        )
    )
    editor
    return (editor,)


@app.cell
def _(editor, mo):
    mo.md(f"```python\n{editor.value!r}\n```")
    return


if __name__ == "__main__":
    app.run()
