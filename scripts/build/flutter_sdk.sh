#!/usr/bin/env bash
# Sourced by the build scripts. Puts Flutter on PATH, in the version the app pins
# with FVM (.fvmrc or .fvm/fvm_config.json in the app folder or a parent), else stable.
flutter_sdk() {
  local d=$PWD v="" f
  while [ -z "$v" ] && [ "$d" != / ]; do
    for f in "$d/.fvmrc" "$d/.fvm/fvm_config.json"; do
      [ -f "$f" ] && v=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('flutter') or d.get('flutterSdkVersion') or '')" "$f" 2>/dev/null) && [ -n "$v" ] && break
    done
    d=$(dirname "$d")
  done
  v=${v%%@*}; v=${v:-stable}
  if command -v flutter >/dev/null && { [ "$v" = stable ] || flutter --version 2>/dev/null | grep -q "Flutter $v "; }; then return 0; fi
  echo "Flutter $v"
  q git clone --depth 1 -b "$v" https://github.com/flutter/flutter.git "$RUNNER_TEMP/flutter" || return 1
  export PATH="$RUNNER_TEMP/flutter/bin:$PATH"
}
