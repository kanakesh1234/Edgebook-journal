#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT="$ROOT_DIR/macos-app/Edgebook Quick Plan/Edgebook Quick Plan.xcodeproj"
BUILD_DIR="$ROOT_DIR/build"
DIST_APP="$ROOT_DIR/dist/Edgebook Quick Plan.app"

echo "Building Edgebook Quick Plan for macOS Safari..."
xcodebuild \
  -project "$PROJECT" \
  -scheme "Edgebook Quick Plan" \
  -configuration Release \
  -derivedDataPath "$BUILD_DIR" \
  CODE_SIGN_IDENTITY="-" \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGNING_ALLOWED=YES \
  AD_HOC_CODE_SIGNING_ALLOWED=YES \
  clean build

BUILT_APP="$BUILD_DIR/Build/Products/Release/Edgebook Quick Plan.app"
mkdir -p "$ROOT_DIR/dist"
rm -rf "$DIST_APP"
cp -R "$BUILT_APP" "$DIST_APP"

echo ""
echo "Built: $DIST_APP"
echo "Installing to /Applications/Edgebook Quick Plan.app..."
rm -rf "/Applications/Edgebook Quick Plan.app"
cp -R "$DIST_APP" "/Applications/Edgebook Quick Plan.app"
pluginkit -a "/Applications/Edgebook Quick Plan.app/Contents/PlugIns/Edgebook Quick Plan Extension.appex" >/dev/null 2>&1 || true
echo "Installed cleanly. Opening Edgebook Quick Plan to finish Safari setup..."
open "/Applications/Edgebook Quick Plan.app" || true
