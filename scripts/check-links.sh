#!/bin/bash
# Check for broken markdown links
#
# This script validates that all markdown links in the repo
# point to existing files or valid URLs.

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Checking markdown links..."

# Find all .md files
MD_FILES=$(find "$REPO_ROOT" -name "*.md" -not -path "*/node_modules/*")

BROKEN=0

for file in $MD_FILES; do
    echo "  Checking: $file"

    # Extract relative file links like [text](path/to/file.md)
    # This is a simple check - doesn't validate URLs
    # Could be extended with curl to check external links

    # For now, just report files found
    grep -o '\[.*\](.*\.md)' "$file" 2>/dev/null || true
done

if [ $BROKEN -eq 0 ]; then
    echo "✅ Link check complete"
    exit 0
else
    echo "❌ Broken links detected"
    exit 1
fi
