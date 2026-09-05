#!/usr/bin/env bash

[ -n "$CI" ] && exit 0

pnpm exec lint-staged
lintStatus=$?

if [ $lintStatus -ne 0 ]; then
    echo "❌ Linting failed"
    exit 1
fi

##
## Scan staged text files for secrets
##

scan_staged_secrets() {
    local file
    local files_scanned=0
    local scan_status=0
    local tmpfile

    if ! pnpm exec secretlint --version >/dev/null 2>&1; then
        echo "secretlint is not available. Run pnpm install from the repository root."
        return 1
    fi

    if ! tmpfile=$(mktemp); then
        echo "Could not create temp file for secret scanning"
        return 1
    fi

    echo "Scanning staged files for secrets (pre-commit hook)"

    while IFS= read -r -d '' file; do
        if ! git show ":$file" > "$tmpfile"; then
            scan_status=1
            continue
        fi

        if LC_ALL=C grep -Iq . "$tmpfile"; then
            files_scanned=$((files_scanned + 1))

            if ! pnpm exec secretlint --format=compact --stdinFileName="$file" < "$tmpfile"; then
                scan_status=1
            fi
        fi
    done < <(git diff --cached --name-only --diff-filter=ACMR -z)

    if [ $files_scanned -eq 0 ]; then
        echo "No staged text files to scan, continuing..."
    fi

    rm -f "$tmpfile"

    return $scan_status
}

scan_staged_secrets
secretScanStatus=$?

if [ $secretScanStatus -ne 0 ]; then
    echo "❌ Secret scanning failed"
    exit 1
fi
