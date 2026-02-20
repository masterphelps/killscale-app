#!/bin/bash
# Verify prompt file integrity against the SHA-256 manifest.
# Run manually or wire into pre-commit hooks.
#
# Usage: ./scripts/verify-prompts.sh
# Exit code 0 = all prompts match, 1 = mismatch detected

MANIFEST="lib/prompts/INTEGRITY.sha256"

if [ ! -f "$MANIFEST" ]; then
  echo "ERROR: Integrity manifest not found at $MANIFEST"
  exit 1
fi

# shasum -c checks each hash line in the manifest
RESULT=$(shasum -a 256 -c "$MANIFEST" 2>&1 | grep -v '^#' | grep -v ': OK$')

if [ -z "$RESULT" ]; then
  echo "Prompt integrity check PASSED — all files match manifest."
  exit 0
else
  echo ""
  echo "WARNING: Prompt file integrity check FAILED!"
  echo "The following files have been modified since the manifest was created:"
  echo ""
  echo "$RESULT"
  echo ""
  echo "If this change is intentional, update the manifest:"
  echo "  shasum -a 256 lib/prompts/*.ts > lib/prompts/INTEGRITY.sha256"
  echo ""
  exit 1
fi
