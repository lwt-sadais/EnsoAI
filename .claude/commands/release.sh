#!/usr/bin/env bash
set -euo pipefail

REPO="lwt-sadais/EnsoAI"
NEW_VERSION="$1"
TAG="v${NEW_VERSION}"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo "============================================"
echo " Release 脚本开始执行"
echo " 目标版本: ${NEW_VERSION}"
echo " Tag: ${TAG}"
echo "============================================"

cd "$ROOT_DIR"

# --------------------------------------------------
# Step 1: 读取当前版本
# --------------------------------------------------
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo ""
echo "[1/6] 当前版本: ${CURRENT_VERSION}"

# --------------------------------------------------
# Step 2: 检查 origin 最新 release tag
# --------------------------------------------------
echo ""
echo "[2/6] 检查 origin 最新 release tag..."

LATEST_TAG=$(git ls-remote --tags origin | grep -o 'refs/tags/v[0-9.]*$' | grep -o 'v[0-9.]*$' | sort -V | tail -1 || echo "")
LATEST_VERSION="${LATEST_TAG#v}"

echo "  origin 最新 tag: ${LATEST_TAG:-无}"

if [ "${LATEST_VERSION}" = "${NEW_VERSION}" ]; then
  echo "  ⚠  该版本已发布过，将清理 GitHub 构建产物和缓存..."

  # 删除现有 Release
  if gh release view "$TAG" --repo "$REPO" &>/dev/null; then
    echo "  → 删除旧 Release: ${TAG}"
    gh release delete "$TAG" --yes --repo "$REPO"
    echo "  ✓ 已删除 Release"
  else
    echo "  → 未找到旧 Release，跳过"
  fi

  # 清理 GitHub Actions 缓存
  echo "  → 清理 GitHub Actions 缓存..."
  CACHE_IDS=$(gh cache list --repo "$REPO" --limit 100 --json id --jq '.[].id' 2>/dev/null || echo "")
  if [ -n "$CACHE_IDS" ]; then
    echo "$CACHE_IDS" | xargs -I {} gh cache delete {} --repo "$REPO"
    echo "  ✓ 已清理 $(echo "$CACHE_IDS" | wc -l | tr -d ' ') 个缓存"
  else
    echo "  → 无缓存需要清理"
  fi
else
  echo "  ✓ 版本号无冲突"
fi

# --------------------------------------------------
# Step 3: 检查 tag 冲突
# --------------------------------------------------
echo ""
echo "[3/6] 检查 tag 冲突..."

# 检查本地 tag
if git tag -l "$TAG" | grep -q "$TAG"; then
  echo "  → 删除本地 tag: ${TAG}"
  git tag -d "$TAG"
  echo "  ✓ 已删除本地 tag"
fi

# 检查远程 tag
if git ls-remote --tags origin "refs/tags/${TAG}" | grep -q "$TAG"; then
  echo "  → 删除远程 tag: ${TAG}"
  git push --delete origin "$TAG"
  echo "  ✓ 已删除远程 tag"
fi

if [ -z "$(git tag -l "$TAG")" ] && ! git ls-remote --tags origin "refs/tags/${TAG}" | grep -q "$TAG"; then
  echo "  ✓ 无 tag 冲突"
fi

# --------------------------------------------------
# Step 4: 更新 package.json 版本号
# --------------------------------------------------
echo ""
echo "[4/6] 更新 package.json 版本号..."

node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '${NEW_VERSION}';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, '\t') + '\n');
"
echo "  ✓ package.json 已更新为 ${NEW_VERSION}"

# --------------------------------------------------
# Step 5: 提交版本更新
# --------------------------------------------------
echo ""
echo "[5/6] 提交版本更新..."

git add package.json
git commit -m "chore: 版本更新至 ${NEW_VERSION}"
echo "  ✓ 已提交"

# --------------------------------------------------
# Step 6: 创建 tag 并推送
# --------------------------------------------------
echo ""
echo "[6/6] 创建 tag 并推送..."

git tag "$TAG"
git push origin "$TAG"
git push origin test

echo ""
echo "============================================"
echo " ✅ Release ${TAG} 已完成！"
echo "============================================"
echo ""
echo " 查看构建进度："
echo " https://github.com/${REPO}/actions/workflows/release.yml"
echo " https://github.com/${REPO}/releases/tag/${TAG}"
echo ""
