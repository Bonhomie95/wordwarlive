#!/usr/bin/env bash
# Builds an iOS Simulator .app (arm64, unsigned) for any supported framework.
# Usage: bash scripts/build/ios.sh <app dir> <framework|auto>
# Env (optional): BUILD_COMMAND + ARTIFACT (custom build or prebuilt .app), IOS_SCHEME,
#   BUILD_ARGS / BUILD_ARGS_SECRET (extra arguments for the automatic build: scripts/build/args.sh)
# Output: $GITHUB_WORKSPACE/app-ios.tgz. All tool output goes to results/build-ios.log
set -uo pipefail
ROOT=${GITHUB_WORKSPACE:-$PWD}; mkdir -p "$ROOT/results"; LOG="$ROOT/results/build-ios.log"
cd "$1" || exit 1
FW=$2; [ "$FW" = auto ] && FW=$(bash "$ROOT/scripts/build/detect.sh")
echo "Framework: $FW"
q() { "$@" >>"$LOG" 2>&1; }
fail() { echo "::error::iOS build failed ($FW): see the encrypted build log"; exit 1; }
npm_install() { [ -f package.json ] && { q npm ci || q npm install; }; return 0; }
# xcodebuild for the Simulator, arm64 only (hosted Macs are Apple Silicon: twice
# as fast, and no Swift compiler crash on x86_64 slices of some pods)
xcbuild() {  # $1 = folder holding the .xcworkspace / .xcodeproj
  local dir=$1 c s
  c=$(find "$dir" -maxdepth 2 -name '*.xcworkspace' -not -path '*/Pods/*' -not -path '*.xcodeproj/*' | head -1)
  if [ -n "$c" ]; then set -- -workspace "$c"; else c=$(find "$dir" -maxdepth 2 -name '*.xcodeproj' -not -path '*/Pods/*' | head -1); set -- -project "$c"; fi
  [ -n "$c" ] || fail
  # Default scheme: the app's own (a workspace also lists every Pod as a scheme)
  s=${IOS_SCHEME:-$(xcodebuild "$@" -list -json 2>/dev/null | python3 -c "import json,sys,os
d=json.load(sys.stdin);d=d.get('workspace') or d.get('project');sc=d['schemes']
base=os.path.splitext(os.path.basename(sys.argv[1]))[0]
print(base if base in sc else sc[0])" "$c")}
  echo "Scheme: $s"
  q xcodebuild "$@" -scheme "$s" -configuration "${IOS_CONFIGURATION:-Release}" -sdk iphonesimulator \
    -destination 'generic/platform=iOS Simulator' -derivedDataPath "$RUNNER_TEMP/dd" \
    EXCLUDED_ARCHS=x86_64 ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO ${BUILD_ARGV[@]+"${BUILD_ARGV[@]}"} build || fail
  OUT=$(find "$RUNNER_TEMP/dd/Build/Products" -maxdepth 2 -path '*iphonesimulator/*.app' -not -name '*Tests*' | head -1)
}

. "$ROOT/scripts/build/args.sh"; BUILD_ARGV=()
if [ -n "${BUILD_COMMAND:-}" ]; then
  [ -n "${BUILD_ARGS:-}${BUILD_ARGS_SECRET:-}" ] && echo "::warning::build_args is ignored with a custom ios_build command"
  FW=custom; q bash -c "$BUILD_COMMAND" || fail; OUT=${ARTIFACT:?ARTIFACT (path of the .app) is required with BUILD_COMMAND}
else build_args || exit 1; case "$FW" in
  flutter)
    . "$ROOT/scripts/build/flutter_sdk.sh"; flutter_sdk || fail
    # Flutter only builds debug for the Simulator; it runs standalone there
    q flutter pub get && q flutter build ios --simulator --debug ${BUILD_ARGV[@]+"${BUILD_ARGV[@]}"} || fail
    OUT=$(find build/ios/iphonesimulator -maxdepth 1 -name '*.app' | head -1) ;;
  expo)
    npm_install; q env CI=1 npx expo prebuild --platform ios --no-install || fail
    (cd ios && q pod install) || true; xcbuild ios ;;
  react-native)
    npm_install; (cd ios && q pod install) || true; xcbuild ios ;;
  capacitor)
    npm_install; q npm run build --if-present; q npx cap sync ios || fail
    [ -f ios/App/Podfile ] && (cd ios/App && q pod install); xcbuild ios/App ;;
  nativescript)
    npm_install
    command -v ns >/dev/null || q npm install -g nativescript || fail
    q ns build ios ${BUILD_ARGV[@]+"${BUILD_ARGV[@]}"} || fail
    OUT=$(find platforms/ios/build -maxdepth 2 -path '*iphonesimulator/*.app' -not -name '*Tests*' 2>/dev/null | head -1) ;;
  maui)
    TF=$(grep -ohE 'net[0-9.]+-ios' ./*.csproj | head -1)
    q dotnet workload install maui-ios && q dotnet build -f "$TF" -c Debug -p:RuntimeIdentifier=iossimulator-arm64 ${BUILD_ARGV[@]+"${BUILD_ARGV[@]}"} || fail
    OUT=$(find bin -path '*iossimulator-arm64*' -name '*.app' -maxdepth 6 | head -1) ;;
  kmp)
    xcbuild "$(dirname "$(find . -maxdepth 3 -name '*.xcodeproj' -not -path '*/Pods/*' | head -1)")" ;;
  native)
    [ -f Podfile ] && q pod install; [ -f ios/Podfile ] && (cd ios && q pod install); xcbuild . ;;
  *) echo "::error::Unknown framework $FW"; exit 1 ;;
esac; fi
[ -n "${OUT:-}" ] && [ -d "$OUT" ] || { echo "::error::No Simulator .app found after the $FW build"; exit 1; }
tar czf "$ROOT/app-ios.tgz" -C "$(dirname "$OUT")" "$(basename "$OUT")"; echo "Simulator app ready ($FW)"
