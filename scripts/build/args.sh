# shellcheck shell=bash
# Sourced by the build scripts. Extra arguments for the automatic build, from the
# build_args input and the BUILD_ARGS secret (inputs of a public repo's runs are
# public: keys go in the secret). They are added to the build command of both
# platforms: `flutter build` for Flutter (--dart-define=API_URL=..., or
# --dart-define-from-file=config.json), `ns build` for NativeScript, Gradle and
# xcodebuild for the others, and dotnet for .NET MAUI. Quotes work like in a shell: --dart-define="NAME=two words".
# Sets BUILD_ARGV. Expand it as ${BUILD_ARGV[@]+"${BUILD_ARGV[@]}"}: an empty array
# with set -u breaks the bash 3.2 of macOS otherwise.
build_args() {
  local all="${BUILD_ARGS:-} ${BUILD_ARGS_SECRET:-}" out a
  BUILD_ARGV=()
  case "$all" in *[![:space:]]*) ;; *) return 0 ;; esac
  # never print the values: the secret part must stay out of the public log
  out=$(python3 -c 'import shlex, sys
for a in shlex.split(sys.argv[1]):
    print(a)' "$all" 2>/dev/null) || { echo "::error::build_args or the BUILD_ARGS secret has unbalanced quotes"; return 1; }
  while IFS= read -r a; do [ -n "$a" ] && BUILD_ARGV+=("$a"); done <<EOF
$out
EOF
  echo "Extra build arguments: ${#BUILD_ARGV[@]}"
}
