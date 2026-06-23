---
name: feedback_language
description: User requires English-only in all project code and docs; Hebrew only allowed in code comments
metadata:
  type: feedback
---

All project code, UI strings, identifiers, file names, error messages, and documentation must be in English only. Hebrew is permitted exclusively in inline code comments (`// ...`).

**Why:** User explicitly stated "אני לא רוצה עברית בפרויקט שלי חוץ מהערות" (no Hebrew in the project except comments).

**How to apply:** When writing or reviewing any file in this project, keep all non-comment text in English. If generating UI labels, string literals, variable names, or docs — use English only.
