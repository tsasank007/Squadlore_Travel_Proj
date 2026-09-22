#!/bin/bash
# One-command deploy: run this from your home directory (~) after uploading
# a new Squadlore_Travel_Proj.zip.
#
# Usage:
#   bash Squadlore_Travel_Proj/scripts/deploy.sh "commit message here"
#
# What it does, in order:
#   1. Unzips the new files over the existing project (overwriting only
#      what changed - .git, .env, node_modules are never touched)
#   2. Shows you exactly what changed (git status) before doing anything else
#   3. Installs dependencies, rebuilds, restarts the server
#   4. Commits and pushes - but only if you pass a commit message

set -e  # stop immediately if any step fails, rather than plowing ahead

cd ~

# Auto-detect the most recently uploaded zip, whatever it's actually named -
# browsers append (1), (2), etc. on repeat downloads, so requiring an exact
# filename kept breaking this. Pick the newest match instead.
ZIP_FILE=$(ls -t Squadlore_Travel_Proj*.zip 2>/dev/null | head -1)
if [ -z "$ZIP_FILE" ]; then
  echo "No Squadlore_Travel_Proj*.zip found in ~ - upload it first."
  exit 1
fi
echo "Using: $ZIP_FILE"

echo "== Unzipping =="
unzip -o "$ZIP_FILE"

echo "== Cleaning up old zip files =="
rm -f ~/Squadlore_Travel_Proj*.zip
echo "Removed all uploaded zips - already extracted, no longer needed."

cd Squadlore_Travel_Proj

echo ""
echo "== What changed (git status) =="
git status

echo ""
echo "== Installing dependencies =="
npm install

echo ""
echo "== Building =="
npm run build

echo ""
echo "== Restarting server =="
pm2 restart squadlore-travel-proj

if [ -n "$1" ]; then
  echo ""
  echo "== Committing and pushing =="
  git add -A
  git commit -m "$1"
  git push
  echo "Done - deployed and pushed."
else
  echo ""
  echo "Deployed, but NOT committed - rerun with a message to commit, e.g.:"
  echo "  bash scripts/deploy.sh \"describe what changed\""
fi
