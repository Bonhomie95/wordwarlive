#!/usr/bin/env bash
# Prints the framework of the app in the current folder:
# flutter | expo | react-native | capacitor | nativescript | maui | kmp | native
set -uo pipefail
if [ -f pubspec.yaml ]; then echo flutter
elif ls capacitor.config.* >/dev/null 2>&1; then echo capacitor
elif ls nativescript.config.* >/dev/null 2>&1 || { [ -f package.json ] && grep -qE '"(@nativescript/core|tns-core-modules)"' package.json; }; then echo nativescript
elif [ -f package.json ] && grep -q '"expo"' package.json && [ ! -d android ] && [ ! -d ios ]; then echo expo
elif [ -f package.json ] && grep -q '"react-native"' package.json; then echo react-native
elif ls ./*.csproj >/dev/null 2>&1 && grep -qi 'UseMaui' ./*.csproj; then echo maui
elif grep -qsE 'multiplatform|kotlin\("multiplatform"\)|kotlinMultiplatform' build.gradle.kts settings.gradle.kts */build.gradle.kts 2>/dev/null; then echo kmp
else echo native
fi
