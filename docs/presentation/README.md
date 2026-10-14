# YCT Exam Portal — presentation documents

| File | What it is |
|---|---|
| `YCT-Exam-Portal-Project-Overview.pdf` | Main project document: the challenge, solution, benefits, how it works, portal tours, technology, deployment, codebase guide, API reference, glossary. |
| `YCT-Exam-Portal-Exams-Office-Guide.pdf` | Handout for exams officers and administrators. |
| `YCT-Exam-Portal-Student-Guide.pdf` | Handout for students. |
| `src/` | The sources: `overview.html`, `admin-guide.html`, `student-guide.html`, the shared `styles.css`, `partials/` (inline-SVG diagrams, screen mock-ups, icons) and `assets/` (crest, local fonts). |
| `build.py` | Rebuilds the PDFs from `src/`. |

**Rebuild** (Python 3.10+ with `playwright`, `pypdf` and `PyMuPDF`, plus Google Chrome or Microsoft Edge installed):

```
python docs/presentation/build.py                 # all three PDFs
python docs/presentation/build.py overview        # just one: overview | admin | student
python docs/presentation/build.py --preview OUT   # also save every page as PNG in OUT/<doc>/
```

Edit text in the `src/*.html` files (shared figures and mock-ups live in `src/partials/`, included with `<!--#include file="partials/…" -->`). The build renders each document twice so the page numbers on the contents page are always correct, then sets the PDF title, author and subject. Screens in the documents are illustrations with sample data.
