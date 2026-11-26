#!/usr/bin/env bash
# Builds an APK that installs on an emulator, for any supported framework.
# Usage: bash scripts/build/android.sh <app dir> <framework|auto>
# Env (optional): BUILD_COMMAND + ARTIFACT (custom build or prebuilt app),
#   BUILD_ARGS / BUILD_ARGS_SECRET (extra arguments for the automatic build: scripts/build/args.sh)
# Output: $GITHUB_WORKSPACE/app.apk. All tool output goes to results/build-android.log
set -uo pipefail
ROOT=${GITHUB_WORKSPACE:-$PWD}; mkdir -p "$ROOT/results"; LOG="$ROOT/results/build-android.log"
cd "$1" || exit 1
FW=$2; [ "$FW" = auto ] && FW=$(bash "$ROOT/scripts/build/detect.sh")
echo "Framework: $FW"
q() { "$@" >>"$LOG" 2>&1; }
fail() { echo "::error::Android build failed ($FW): see the encrypted build log"; exit 1; }
npm_install() { [ -f package.json ] && { q npm ci || q npm install; }; return 0; }
apk() { find "${1:-.}" -path "*build/outputs/apk/*$2*/*.apk" -not -name '*androidTest*' -not -name '*unaligned*' | head -1; }

. "$ROOT/scripts/build/args.sh"; BUILD_ARGV=()
if [ -n "${BUILD_COMMAND:-}" ]; then
  [ -n "${BUILD_ARGS:-}${BUILD_ARGS_SECRET:-}" ] && echo "::warning::build_args is ignored with a custom android_build command"
  FW=custom; q bash -c "$BUILD_COMMAND" || fail; OUT=${ARTIFACT:?ARTIFACT (path of the .apk) is required with BUILD_COMMAND}
else build_args || exit 1; case "$FW" in
  flutter)
    . "$ROOT/scripts/build/flutter_sdk.sh"; flutter_sdk || fail
    q flutter pub get || fail
    # Debug, like the iOS Simulator build: no signing key needed, a faster build,
    # and Flutter draws its overflow warnings on screen, where the agents see them
    q flutter build apk --debug --target-platform android-x64 ${BUILD_ARGV[@]+"${BUILD_ARGV[@]}"} || fail
    OUT=$(ls build/app/outputs/flutter-apk/*debug*.apk 2>/dev/null | head -1) ;;
  expo)
    npm_install; q env CI=1 npx expo prebuild --platform android --no-install || fail
    (cd android && q ./gradlew assembleRelease -PreactNativeArchitectures=x86_64 --build-cache ${BUILD_ARGV[@]+"${BUILD_ARGV[@]}"}) || fail; OUT=$(apk android release) ;;
  react-native)
    npm_install; (cd android && q ./gradlew assembleRelease -PreactNativeArchitectures=x86_64 --build-cache ${BUILD_ARGV[@]+"${BUILD_ARGV[@]}"}) || fail; OUT=$(apk android release) ;;
  capacitor)
    # Release APKs are unsigned in a fresh Capacitor project: the debug APK is self-contained
    npm_install; q npm run build --if-present; q npx cap sync android || fail
    (cd android && q ./gradlew assembleDebug --build-cache ${BUILD_ARGV[@]+"${BUILD_ARGV[@]}"}) || fail; OUT=$(apk android debug) ;;
  nativescript)
    npm_install
    command -v ns >/dev/null || q npm install -g nativescript || fail
    q ns build android ${BUILD_ARGV[@]+"${BUILD_ARGV[@]}"} || fail
    OUT=$(apk platforms/android debug) ;;
  maui)
    TF=$(grep -ohE 'net[0-9.]+-android' ./*.csproj | head -1)
    q dotnet workload install maui-android && q dotnet publish -f "$TF" -c Release -p:AndroidPackageFormat=apk -o "$RUNNER_TEMP/maui" ${BUILD_ARGV[@]+"${BUILD_ARGV[@]}"} || fail
    OUT=$(find "$RUNNER_TEMP/maui" -name '*-Signed.apk' | head -1) ;;
  kmp|native)
    D=.; [ -x ./gradlew ] || D=android
    (cd "$D" && chmod +x gradlew && q ./gradlew assembleDebug --build-cache ${BUILD_ARGV[@]+"${BUILD_ARGV[@]}"}) || fail; OUT=$(apk "$D" debug) ;;
  *) echo "::error::Unknown framework $FW"; exit 1 ;;
esac; fi
[ -n "${OUT:-}" ] && [ -f "$OUT" ] || { echo "::error::No APK found after the $FW build"; exit 1; }
cp "$OUT" "$ROOT/app.apk"; echo "APK ready ($FW)"
