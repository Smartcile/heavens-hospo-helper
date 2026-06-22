#!/usr/bin/env bash
# .husky/pre-push — ensures docs are updated before push
# Install: npx husky add .husky/pre-push 'bash .husky/pre-push'

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" = "develop" ] || [ "$BRANCH" = "master" ]; then
  # Get the last commit where any .md file was changed
  LAST_DOC_COMMIT=$(git log -1 --format="%H" -- CLAUDE.md ROADMAP.md)
  # Get the last commit overall
  LAST_COMMIT=$(git log -1 --format="%H")
  
  if [ "$LAST_DOC_COMMIT" != "$LAST_COMMIT" ]; then
    echo ""
    echo "⚠️  CLAUDE.md or ROADMAP.md may be out of date."
    echo "   Run 'npm run docs:check' to review what changed."
    echo ""
    # Uncomment to BLOCK the push:
    # exit 1
  fi
fi
