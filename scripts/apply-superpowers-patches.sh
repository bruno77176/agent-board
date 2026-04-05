#!/usr/bin/env bash
set -euo pipefail

SUPERPOWERS_BASE="$HOME/.claude/plugins/cache/claude-plugins-official/superpowers"
PATCHES_DIR="$(cd "$(dirname "$0")/../patches/superpowers" && pwd)"

if [ ! -d "$SUPERPOWERS_BASE" ]; then
  echo "❌ Superpowers not found at $SUPERPOWERS_BASE"
  echo "   Install superpowers in Claude Code first, then re-run this script."
  exit 1
fi

# Find the latest installed version
LATEST=$(ls -v "$SUPERPOWERS_BASE" | tail -1)
SKILLS="$SUPERPOWERS_BASE/$LATEST/skills"

echo "🔧 Applying agent-board patches to superpowers $LATEST..."
echo "   Skills dir: $SKILLS"
echo ""

apply_patch() {
  local skill_file="$1"
  local patch_file="$2"
  local label="$3"

  if patch --dry-run --silent --forward "$skill_file" < "$patch_file" 2>/dev/null; then
    patch --forward "$skill_file" < "$patch_file"
    echo "  ✅ $label"
  elif patch --dry-run --silent --reverse --forward "$skill_file" < "$patch_file" 2>/dev/null; then
    echo "  ⏭  $label (already applied)"
  else
    echo "  ⚠️  $label — patch failed (skill may have been updated upstream)"
    echo "     Check $patch_file and apply manually if needed."
  fi
}

apply_patch \
  "$SKILLS/dispatching-parallel-agents/SKILL.md" \
  "$PATCHES_DIR/dispatching-parallel-agents.patch" \
  "dispatching-parallel-agents: add story_id resolution step"

apply_patch \
  "$SKILLS/executing-plans/SKILL.md" \
  "$PATCHES_DIR/executing-plans.patch" \
  "executing-plans: add board tracking to task loop"

apply_patch \
  "$SKILLS/subagent-driven-development/implementer-prompt.md" \
  "$PATCHES_DIR/subagent-driven-development-implementer-prompt.patch" \
  "subagent-driven-development implementer-prompt: add board tracking section"

apply_patch \
  "$SKILLS/writing-plans/SKILL.md" \
  "$PATCHES_DIR/writing-plans-board-setup.patch" \
  "writing-plans: add mandatory board setup step after saving plan"

echo ""
echo "✅ Done. Re-run this script after any superpowers /update."
