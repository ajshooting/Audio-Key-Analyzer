#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="${1:-$(jq -r '.version' "${repository_root}/manifest.json")}"
git_ref="${2:-HEAD}"
output_directory="${3:-${repository_root}/dist}"

if [[ ! "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Version must use the format MAJOR.MINOR.PATCH." >&2
  exit 1
fi

git -C "${repository_root}" rev-parse --verify "${git_ref}^{commit}" >/dev/null

manifest_version="$(git -C "${repository_root}" show "${git_ref}:manifest.json" | jq -r '.version')"
if [[ "${manifest_version}" != "${version}" ]]; then
  echo "Requested version (${version}) does not match manifest.json at ${git_ref} (${manifest_version})." >&2
  exit 1
fi

archive_name="Audio-Key-Analyzer-v${version}.zip"
archive_path="${output_directory}/${archive_name}"
checksum_path="${archive_path}.sha256"

package_paths=(
  manifest.json
  background.js
  popup.html
  popup.js
  display-utils.js
  offscreen.html
  offscreen.js
  sandbox.html
  sandbox.js
  audio-processor.js
  README.md
  CHANGELOG.md
  PRIVACY.md
  LICENSE
  _locales
  icons
  essentia
)

mkdir -p "${output_directory}"
git -C "${repository_root}" archive \
  --format=zip \
  --output="${archive_path}" \
  "${git_ref}" \
  -- "${package_paths[@]}"

(
  cd "${output_directory}"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${archive_name}" > "$(basename "${checksum_path}")"
  else
    shasum -a 256 "${archive_name}" > "$(basename "${checksum_path}")"
  fi
)

echo "Created ${archive_path}"
echo "Created ${checksum_path}"
