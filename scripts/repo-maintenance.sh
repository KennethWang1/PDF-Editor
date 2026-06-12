#!/bin/bash
# ===============================================
# REPOSITORY MAINTENANCE SCRIPT
# ===============================================
# Run this script weekly to maintain repository health

echo "🔧 Starting repository maintenance..."

# Navigate to project root
cd "$(dirname "$0")"

echo ""
echo "📊 Repository Status:"
echo "====================="

# Check repository size
echo "📏 Repository size:"
du -sh .git/ 2>/dev/null || echo "   Could not determine size"

# Check for large files
echo ""
echo "📦 Large files (>1MB):"
find . -type f -size +1M -not -path './.git/*' -not -path './node_modules/*' | head -10

# Check for untracked files that might be sensitive
echo ""
echo "🔍 Potentially sensitive untracked files:"
git status --porcelain | grep "^??" | grep -iE "\.(key|pem|env|log|cache)" | head -10

# Check for tracked files that should be ignored
echo ""
echo "⚠️  Files tracked that should probably be ignored:"
git ls-files | grep -iE "\.(log|cache|tmp)" | head -10

# Cleanup suggestions
echo ""
echo "🧹 Cleanup Recommendations:"
echo "============================"

# Check for old branches
BRANCHES=$(git branch -r --merged origin/master | grep -v "origin/master" | wc -l)
if [ $BRANCHES -gt 0 ]; then
    echo "📌 $BRANCHES merged remote branches can be cleaned up"
fi

# Check for large commit history
COMMITS=$(git rev-list --count HEAD)
echo "📈 Total commits: $COMMITS"

# Check .gitignore coverage
echo ""
echo "📋 Security Checklist:"
echo "======================"
echo "✓ .gitignore exists: $(test -f .gitignore && echo "YES" || echo "NO")"
echo "✓ .env.example exists: $(test -f .env.example && echo "YES" || echo "NO")"
echo "✓ Pre-commit hook active: $(test -x .git/hooks/pre-commit && echo "YES" || echo "NO")"
echo "✓ No .env in git: $(git ls-files | grep -E "^\.env$" > /dev/null && echo "FOUND!" || echo "SAFE")"

echo ""
echo "🎯 Maintenance Commands:"
echo "========================"
echo "To run garbage collection: git gc --aggressive"
echo "To prune remote branches: git remote prune origin"
echo "To check repository integrity: git fsck"
echo "To view largest files: git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | grep '^blob' | sort -nr -k3 | head -20"

echo ""
echo "✅ Maintenance check complete!"
