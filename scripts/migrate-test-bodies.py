#!/usr/bin/env python3
"""Migrate test fixtures from PortableText arrays to Inkling documents.

Usage:
    python scripts/migrate-test-bodies.py tests/**/*.test.ts tests/**/*.test.tsx
"""
import re
import sys
from pathlib import Path

NEEDED_EMPTY = "emptyInklingDocument"
NEEDED_FROM_PT = "inklingFromPt"
IMPORT_LINE = "import { emptyInklingDocument, inklingFromPt } from '#/_helpers/inkling'\n"


def find_array_span(text: str, start: int) -> tuple[int, int] | None:
    """Return the [start, end) span of the array literal starting at `start`."""
    if text[start] != "[":
        return None
    depth = 0
    in_string = None
    i = start
    n = len(text)
    while i < n:
        ch = text[i]
        if in_string:
            if ch == "\\":
                i += 2
                continue
            if ch == in_string:
                in_string = None
        elif ch in ('"', "'", "`"):
            in_string = ch
        elif ch == "[":
            depth += 1
            if depth == 1:
                i += 1
                continue
        elif ch == "]":
            if depth == 1:
                return (start, i + 1)
            depth -= 1
        i += 1
    return None


def migrate_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    original = text

    # Find every "body:" followed (after whitespace) by "[" and replace it.
    pattern = re.compile(r"(body:\s*)(\[)")
    replacements = []
    for match in pattern.finditer(text):
        prefix_end = match.end(2)
        span = find_array_span(text, prefix_end - 1)
        if span is None:
            continue
        array_start, array_end = span
        array_text = text[array_start:array_end]
        inner = text[array_start + 1 : array_end - 1]
        if inner.strip() == "":
            new_text = f"{match.group(1)}emptyInklingDocument()"
        else:
            new_text = f"{match.group(1)}inklingFromPt({array_text})"
        replacements.append((match.start(1), array_end, new_text))

    if not replacements:
        return False

    # Apply replacements in reverse order so offsets stay valid.
    for start, end, new_text in reversed(replacements):
        text = text[:start] + new_text + text[end:]

    # Add import if needed.
    needs_empty = any("emptyInklingDocument()" in r[2] for r in replacements)
    needs_from_pt = any("inklingFromPt(" in r[2] for r in replacements)
    if needs_empty or needs_from_pt:
        if "#/_helpers/inkling" not in text:
            # Insert after the last import statement (including multi-line brace imports).
            last_import = -1
            for m in re.finditer(r"^import\b.*?from\s+['\"][^'\"]+['\"];?\n", text, re.MULTILINE | re.DOTALL):
                last_import = m.end()
            if last_import != -1:
                text = text[:last_import] + IMPORT_LINE + text[last_import:]
            else:
                text = IMPORT_LINE + text
        else:
            # Ensure both identifiers are imported.
            import_match = re.search(r"import \{([^}]+)\} from '#/_helpers/inkling'", text)
            if import_match:
                existing = import_match.group(1)
                missing = []
                if needs_empty and NEEDED_EMPTY not in existing:
                    missing.append(NEEDED_EMPTY)
                if needs_from_pt and NEEDED_FROM_PT not in existing:
                    missing.append(NEEDED_FROM_PT)
                if missing:
                    new_import = f"import {{ {existing.strip()}, {', '.join(missing)} }} from '#/_helpers/inkling'"
                    text = text[: import_match.start()] + new_import + text[import_match.end() :]

    if text != original:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def main() -> int:
    changed = 0
    for arg in sys.argv[1:]:
        for path in Path.cwd().glob(arg):
            if path.is_file():
                if migrate_file(path):
                    print(f"migrated {path}")
                    changed += 1
    print(f"changed {changed} file(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
