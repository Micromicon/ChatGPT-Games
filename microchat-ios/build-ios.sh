#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")"

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo 'Для сборки iPhone-приложения нужен Mac с Xcode. Linux не создаёт устанавливаемый IPA.' >&2
  exit 1
fi
build_dir="${MICROCHAT_IOS_BUILD_DIR:-$PWD/build}"
mode="${1:-simulator}"
swift test --scratch-path "$build_dir/CoreTests"

case "$mode" in
  simulator)
    xcodebuild -project MicroChat.xcodeproj -scheme MicroChat -configuration Debug \
      -destination 'generic/platform=iOS Simulator' -derivedDataPath "$build_dir/DerivedData" \
      CODE_SIGNING_ALLOWED=NO build
    ;;
  test)
    : "${MICROCHAT_IOS_DESTINATION:?Задай MICROCHAT_IOS_DESTINATION, например platform=iOS Simulator,id=UUID из xcrun simctl list devices available}"
    xcodebuild -project MicroChat.xcodeproj -scheme MicroChat -configuration Debug \
      -destination "$MICROCHAT_IOS_DESTINATION" -derivedDataPath "$build_dir/DerivedData" \
      CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- test
    ;;
  archive)
    xcodebuild -project MicroChat.xcodeproj -scheme MicroChat -configuration Release \
      -destination 'generic/platform=iOS' -archivePath "$build_dir/MicroChat-unsigned.xcarchive" \
      CODE_SIGNING_ALLOWED=NO archive
    echo 'Создан только неподписанный .xcarchive. Он не устанавливается на iPhone.'
    ;;
  ipa)
    : "${MICROCHAT_TEAM_ID:?Задай Team ID аккаунта Apple Developer, настроенного в Xcode}"
    : "${MICROCHAT_EXPORT_OPTIONS:?Задай абсолютный путь к ExportOptions.plist, подготовленному в Xcode для выбранного способа распространения}"
    if [[ ! -f "$MICROCHAT_EXPORT_OPTIONS" ]]; then
      echo 'ExportOptions.plist не найден.' >&2
      exit 1
    fi
    xcodebuild -project MicroChat.xcodeproj -scheme MicroChat -configuration Release \
      -destination 'generic/platform=iOS' -archivePath "$build_dir/MicroChat.xcarchive" \
      DEVELOPMENT_TEAM="$MICROCHAT_TEAM_ID" archive
    xcodebuild -exportArchive -archivePath "$build_dir/MicroChat.xcarchive" \
      -exportOptionsPlist "$MICROCHAT_EXPORT_OPTIONS" -exportPath "$build_dir/IPA"
    ;;
  *) echo 'Режимы: simulator | test | archive | ipa' >&2; exit 2 ;;
esac
