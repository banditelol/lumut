# /// script
# requires-python = ">=3.11"
# dependencies = ["anywidget>=0.11", "marimo>=0.23", "lumut>=0.1.1"]
# ///

import marimo

__generated_with = "0.24.2"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo

    from lumut import exp_data_editor, data_editor_enhance

    return exp_data_editor, mo


@app.cell
def _(exp_data_editor, mo):
    editor = mo.ui.anywidget(
        exp_data_editor(
            [
                {
                    "name": "Ada Lovelace",
                    "role": "Mathematician",
                    "notes": "Short note.",
                },
                {
                    "name": "Grace Hopper",
                    "role": "Computer scientist",
                    "notes": "A medium-length note that should fit in a couple of lines when the Notes column is narrowed.",
                },
                {"name": "Katherine Johnson", "role": "Mathematician", "notes": "This deliberately long note is here to exercise wrapped text and row measurement. Narrow the Notes column, then widen it again: the row should grow and shrink without overlapping the next row."},
                {"name": "Dorothy Vaughan", "role": "Programmer", "notes": "Line one\nLine two is intentionally longer than the first line.\nLine three makes manual line breaks easy to test."},
                {"name": "Mary Jackson", "role": "Engineer", "notes": "A compact entry."},
                {"name": "Annie Easley", "role": "Computer scientist", "notes": "Rows beyond the first viewport have different lengths too, so scrolling validates that only rendered rows are measured while unrendered rows retain a conservative estimate."},
                {"name": "Margaret Hamilton", "role": "Software engineer", "notes": "An especially verbose record designed to reach the configured maximum row height when the Notes column becomes very narrow. Its extra content must be clipped at that limit rather than shifting later rows into the wrong position."*100},
                {"name": "Radia Perlman", "role": "Network engineer", "notes": "Medium note: resize separators are deliberately visible in the header."},
                {"name": "Sister Mary Kenneth Keller", "role": "Educator", "notes": "Tiny."},
                {"name": "Jean Bartik", "role": "Programmer", "notes": "Another variable-length row for scroll and resize testing, with enough text to wrap at narrow widths but stay compact at the default size."},
            ] * 10_000,
            label="Experimental data editor",
            editable_columns=["role", "notes"],
            wrapped_columns=["notes"],
            auto_row_height=True,
            max_row_height=120,
        )
    )
    editor
    return (editor,)


@app.cell
def _(editor):
    editor.value["value"][-5:]
    return


@app.cell
def _(mo):
    ori_editor = mo.ui.data_editor(
            [
                {
                    "name": "Ada Lovelace",
                    "role": "Mathematician",
                    "notes": "Short note.",
                },
                {
                    "name": "Grace Hopper",
                    "role": "Computer scientist",
                    "notes": "A medium-length note that should fit in a couple of lines when the Notes column is narrowed.",
                },
                {"name": "Katherine Johnson", "role": "Mathematician", "notes": "This deliberately long note is here to exercise wrapped text and row measurement. Narrow the Notes column, then widen it again: the row should grow and shrink without overlapping the next row."},
                {"name": "Dorothy Vaughan", "role": "Programmer", "notes": "Line one\nLine two is intentionally longer than the first line.\nLine three makes manual line breaks easy to test."},
                {"name": "Mary Jackson", "role": "Engineer", "notes": "A compact entry."},
                {"name": "Annie Easley", "role": "Computer scientist", "notes": "Rows beyond the first viewport have different lengths too, so scrolling validates that only rendered rows are measured while unrendered rows retain a conservative estimate."},
                {"name": "Margaret Hamilton", "role": "Software engineer", "notes": "An especially verbose record designed to reach the configured maximum row height when the Notes column becomes very narrow. Its extra content must be clipped at that limit rather than shifting later rows into the wrong position."*10},
                {"name": "Radia Perlman", "role": "Network engineer", "notes": "Medium note: resize separators are deliberately visible in the header."},
                {"name": "Sister Mary Kenneth Keller", "role": "Educator", "notes": "Tiny."},
                {"name": "Jean Bartik", "role": "Programmer", "notes": "Another variable-length row for scroll and resize testing, with enough text to wrap at narrow widths but stay compact at the default size."},
            ],
            label="Experimental data editor",
            editable_columns=["role", "notes"],
            # wrapped_columns=["notes"],
    )
    ori_editor
    return (ori_editor,)


@app.cell
def _(ori_editor):
    ori_editor.value
    return


@app.cell
def _():
    return


if __name__ == "__main__":
    app.run()
