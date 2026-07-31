#!/usr/bin/env bash
#
# upstream-sync.sh — Sync this fork with upstream TauricResearch/TradingAgents
# Preserves local customizations (.gitignore, CLAUDE.md, .claude/)
#
# Usage:
#   upstream-sync.sh [--dry-run] [--branch <name>]
#
# Exit codes:
#   0 — Success or already up-to-date
#   1 — Merge conflicts in non-protected files (needs manual resolution)
#   2 — Pre-condition failure (dirty tree, network error, etc.)

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────
UPSTREAM_URL="https://github.com/TauricResearch/TradingAgents.git"
UPSTREAM_REMOTE="upstream"
UPSTREAM_BRANCH="main"
PROTECTED_PATHS=(".gitignore" "CLAUDE.md")
REVERT_DIRS=()

# ─── Argument parsing ────────────────────────────────────────────
DRY_RUN=false
SYNC_BRANCH=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --branch)
            SYNC_BRANCH="$2"
            shift 2
            ;;
        *)
            echo "ERROR: Unknown option: $1" >&2
            echo "Usage: upstream-sync.sh [--dry-run] [--branch <name>]" >&2
            exit 2
            ;;
    esac
done

# ─── Helper functions ────────────────────────────────────────────
info()  { echo "▸ $*"; }
warn()  { echo "⚠ $*" >&2; }
error() { echo "✖ $*" >&2; }

# ─── Step 1: Pre-flight checks ──────────────────────────────────
info "Pre-flight checks..."

# Must be inside a git repo
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    error "Not inside a git repository"
    exit 2
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

# Working tree must be clean
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    error "Working tree is dirty. Commit or stash changes first."
    echo ""
    git status --short
    exit 2
fi

if [[ -n $(git ls-files --others --exclude-standard) ]]; then
    warn "Untracked files detected (will not affect merge, continuing)"
fi

ORIGINAL_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD)
info "Current branch: $ORIGINAL_BRANCH"

# ─── Step 2: Ensure upstream remote ─────────────────────────────
info "Checking upstream remote..."

if git remote get-url "$UPSTREAM_REMOTE" &>/dev/null; then
    CURRENT_URL=$(git remote get-url "$UPSTREAM_REMOTE")
    if [[ "$CURRENT_URL" != *"TauricResearch/TradingAgents"* ]]; then
        warn "upstream remote URL ($CURRENT_URL) doesn't point to TauricResearch/TradingAgents"
        warn "Updating to $UPSTREAM_URL"
        git remote set-url "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
    fi
    info "upstream remote OK: $(git remote get-url "$UPSTREAM_REMOTE")"
else
    info "Adding upstream remote: $UPSTREAM_URL"
    git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
fi

# ─── Step 3: Fetch upstream ─────────────────────────────────────
info "Fetching upstream/$UPSTREAM_BRANCH..."

if ! git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH" 2>&1; then
    error "Failed to fetch from upstream. Check network connection."
    exit 2
fi

# Count new commits
LOCAL_HEAD=$(git rev-parse HEAD)
UPSTREAM_HEAD=$(git rev-parse "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")
MERGE_BASE=$(git merge-base HEAD "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" 2>/dev/null || echo "")

if [[ "$LOCAL_HEAD" == "$UPSTREAM_HEAD" ]] || [[ "$MERGE_BASE" == "$UPSTREAM_HEAD" ]]; then
    info "Already up-to-date with upstream/$UPSTREAM_BRANCH"
    exit 0
fi

if [[ -z "$MERGE_BASE" ]]; then
    NEW_COMMITS="(unable to determine — no common ancestor)"
    warn "No common merge base found. This may be a first-time sync."
else
    NEW_COMMIT_COUNT=$(git rev-list --count "$MERGE_BASE".."$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")
    NEW_COMMITS="$NEW_COMMIT_COUNT new commit(s)"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Upstream Changes Summary"
echo "═══════════════════════════════════════════════════════════"
echo " New commits: $NEW_COMMITS"
echo ""
echo " Recent commits from upstream:"
git log --oneline --no-merges -15 "$MERGE_BASE".."$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" 2>/dev/null | sed 's/^/   /'
echo ""

# Changed files summary
CHANGED_FILES=$(git diff --stat "$MERGE_BASE".."$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" 2>/dev/null | tail -1)
echo " Changed files: $CHANGED_FILES"
echo ""

# Check if protected files are touched
PROTECTED_TOUCHED=false
for path in "${PROTECTED_PATHS[@]}"; do
    if git diff --name-only "$MERGE_BASE".."$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" 2>/dev/null | grep -qx "$path"; then
        warn "Protected file touched by upstream: $path"
        PROTECTED_TOUCHED=true
    fi
done

if [[ "$PROTECTED_TOUCHED" == "true" ]]; then
    echo " ⚠ Protected files were modified upstream — they will be auto-restored after merge"
fi

# Check if revert directories are touched (only if REVERT_DIRS is non-empty)
if [[ ${#REVERT_DIRS[@]} -gt 0 ]]; then
    for dir in "${REVERT_DIRS[@]}"; do
        REVERT_COUNT=$(git diff --name-only "$MERGE_BASE".."$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" 2>/dev/null | grep -c "^${dir}/" || true)
        if [[ "$REVERT_COUNT" -gt 0 ]]; then
            warn "Revert-protected directory touched by upstream: $dir/ ($REVERT_COUNT files) — changes will be auto-reverted after merge"
        fi
    done
fi

# Check if workflows were changed (informational, not reverted)
WORKFLOW_COUNT=$(git diff --name-only "$MERGE_BASE".."$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" 2>/dev/null | grep -c "^\.github/workflows/" || true)
if [[ "$WORKFLOW_COUNT" -gt 0 ]]; then
    info "GitHub Actions workflows changed by upstream: $WORKFLOW_COUNT file(s) — will be merged (review recommended)"
fi

echo "═══════════════════════════════════════════════════════════"
echo ""

# ─── Step 4: Dry-run exit ───────────────────────────────────────
if [[ "$DRY_RUN" == "true" ]]; then
    info "Dry-run complete. No changes made."
    exit 0
fi

# ─── Step 5: Optional branch creation ───────────────────────────
if [[ -n "$SYNC_BRANCH" ]]; then
    info "Creating sync branch: $SYNC_BRANCH"
    git checkout -b "$SYNC_BRANCH"
fi

# ─── Step 6: Backup protected files ─────────────────────────────
BACKUP_DIR=$(mktemp -d)
info "Backing up protected files to $BACKUP_DIR"

for path in "${PROTECTED_PATHS[@]}"; do
    if [[ -f "$path" ]]; then
        mkdir -p "$BACKUP_DIR/$(dirname "$path")"
        cp "$path" "$BACKUP_DIR/$path"
        info "  Backed up: $path"
    fi
done

# ─── Step 7: Merge ──────────────────────────────────────────────
info "Merging upstream/$UPSTREAM_BRANCH..."

MERGE_RESULT=0
git merge "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" --no-edit \
    -m "chore: sync with upstream TauricResearch/TradingAgents" 2>&1 || MERGE_RESULT=$?

if [[ $MERGE_RESULT -ne 0 ]]; then
    info "Merge produced conflicts. Checking which files..."
    echo ""

    CONFLICT_FILES=$(git diff --name-only --diff-filter=U 2>/dev/null || true)
    PROTECTED_CONFLICTS=()
    UNPROTECTED_CONFLICTS=()

    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        IS_PROTECTED=false
        for path in "${PROTECTED_PATHS[@]}"; do
            if [[ "$file" == "$path" ]]; then
                IS_PROTECTED=true
                break
            fi
        done
        if [[ "$IS_PROTECTED" == "true" ]]; then
            PROTECTED_CONFLICTS+=("$file")
        else
            UNPROTECTED_CONFLICTS+=("$file")
        fi
    done <<< "$CONFLICT_FILES"

    # Auto-resolve protected file conflicts from backup
    for file in "${PROTECTED_CONFLICTS[@]}"; do
        info "Auto-resolving protected file: $file (restoring local version)"
        cp "$BACKUP_DIR/$file" "$file"
        git add "$file"
    done

    if [[ ${#UNPROTECTED_CONFLICTS[@]} -gt 0 ]]; then
        echo ""
        error "Unresolved conflicts in non-protected files:"
        for file in "${UNPROTECTED_CONFLICTS[@]}"; do
            echo "   ✖ $file"
        done
        echo ""
        echo "These conflicts need manual resolution."
        echo "After resolving, run: git add <files> && git commit --no-edit"

        # Clean up backup
        rm -rf "$BACKUP_DIR"
        exit 1
    fi

    # Only protected conflicts — auto-resolve and commit
    if [[ ${#PROTECTED_CONFLICTS[@]} -gt 0 ]] && [[ ${#UNPROTECTED_CONFLICTS[@]} -eq 0 ]]; then
        info "All conflicts were in protected files and have been auto-resolved"
        git commit --no-edit
    fi
fi

# ─── Step 8: Post-merge — restore protected files ───────────────
info "Verifying protected files..."

NEEDS_AMEND=false
for path in "${PROTECTED_PATHS[@]}"; do
    if [[ -f "$BACKUP_DIR/$path" ]] && [[ -f "$path" ]]; then
        if ! diff -q "$BACKUP_DIR/$path" "$path" &>/dev/null; then
            info "  Restoring: $path (was changed by merge)"
            cp "$BACKUP_DIR/$path" "$path"
            git add "$path"
            NEEDS_AMEND=true
        else
            info "  OK: $path (unchanged)"
        fi
    fi
done

if [[ "$NEEDS_AMEND" == "true" ]]; then
    git commit --amend --no-edit
    info "Protected files restored and commit amended"
fi

# ─── Step 8b: Post-merge — revert protected directories ─────────
if [[ ${#REVERT_DIRS[@]} -gt 0 ]]; then
    info "Checking for directory changes to revert..."

    REVERT_NEEDED=false
    for dir in "${REVERT_DIRS[@]}"; do
        # Find files in this dir that were changed by the merge
        CHANGED_IN_DIR=$(git diff --name-only HEAD~1..HEAD -- "$dir" 2>/dev/null || true)
        if [[ -n "$CHANGED_IN_DIR" ]]; then
            info "  Reverting upstream changes in $dir/:"
            while IFS= read -r file; do
                [[ -z "$file" ]] && continue
                # Restore to pre-merge state
                git checkout HEAD~1 -- "$file" 2>/dev/null && info "    Reverted: $file" || true
            done <<< "$CHANGED_IN_DIR"
            REVERT_NEEDED=true
        fi

        # Check for new files added by upstream in this dir
        NEW_IN_DIR=$(git diff --name-only --diff-filter=A HEAD~1..HEAD -- "$dir" 2>/dev/null || true)
        if [[ -n "$NEW_IN_DIR" ]]; then
            while IFS= read -r file; do
                [[ -z "$file" ]] && continue
                git rm -f "$file" &>/dev/null && info "    Removed new: $file" || true
            done <<< "$NEW_IN_DIR"
            REVERT_NEEDED=true
        fi
    done

    if [[ "$REVERT_NEEDED" == "true" ]]; then
        git add -A
        git commit --amend --no-edit
        info "Directory changes reverted and commit amended"
    fi
fi

# Verify .claude/ directory
if [[ -d ".claude" ]]; then
    info "  OK: .claude/ directory intact"
else
    warn ".claude/ directory not found — this is unexpected"
fi

# ─── Step 9: Cleanup and report ─────────────────────────────────
rm -rf "$BACKUP_DIR"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Sync Complete"
echo "═══════════════════════════════════════════════════════════"
echo " Branch:  $(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD)"
echo " HEAD:    $(git rev-parse --short HEAD)"
echo " Merged:  $NEW_COMMITS from upstream"
echo ""

if [[ -n "$SYNC_BRANCH" ]]; then
    echo " Next steps:"
    echo "   1. Review changes on branch '$SYNC_BRANCH'"
    echo "   2. Install deps: pip install -e ."
    echo "   3. Run tests: pytest"
    echo "   4. Merge to main: git checkout main && git merge $SYNC_BRANCH"
else
    echo " Next steps:"
    echo "   1. Install deps if needed: pip install -e ."
    echo "   2. Run tests to verify: pytest"
    echo "   3. Push when ready: git push"
fi

echo "═══════════════════════════════════════════════════════════"
exit 0
