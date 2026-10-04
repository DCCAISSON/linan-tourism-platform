#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: prepare-release-candidate.sh <tested-commit-sha> [output-dir]

Creates a local rollback-ready release candidate archive from an explicit tested
Git commit. It never packages the working tree and never deploys or restarts the
remote server.

The working tree must be clean so the chosen commit is the exact source that was
tested. If this fails, commit or intentionally exclude pending work before
building a candidate.
USAGE
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ] || [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  usage
  exit 2
fi

tested_commit="$1"
output_dir="${2:-.omo/evidence/linan-remaining-business-20260922/task-15-release-precheck/release-candidate}"

if ! git cat-file -e "${tested_commit}^{commit}" 2>/dev/null; then
  echo "error: tested commit does not exist: ${tested_commit}" >&2
  exit 1
fi

resolved_commit="$(git rev-parse "${tested_commit}^{commit}")"
current_head="$(git rev-parse HEAD)"
if [ "${resolved_commit}" != "${current_head}" ]; then
  echo "error: tested commit must equal current HEAD" >&2
  echo "tested=${resolved_commit}" >&2
  echo "head=${current_head}" >&2
  exit 1
fi

if [ -n "$(git status --porcelain=v1)" ]; then
  echo "error: working tree is dirty; git archive would omit uncommitted files" >&2
  git status --short >&2
  exit 1
fi

short="$(git rev-parse --short=12 "${resolved_commit}")"
mkdir -p "${output_dir}"
archive="${output_dir}/linan-test-${short}.tar.gz"
manifest="${output_dir}/linan-test-${short}.manifest.txt"

git archive --format=tar.gz --prefix="app/" "${resolved_commit}" -o "${archive}"

sha256="$(sha256sum "${archive}" | awk '{print $1}')"
cat > "${manifest}" <<MANIFEST
release_candidate_commit=${resolved_commit}
release_candidate_short=${short}
archive=$(basename "${archive}")
archive_sha256=${sha256}
created_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
source=git archive explicit tested commit
remote_candidate_dir=/opt/linan-test/app-candidate-${short}
remote_current_dir=/opt/linan-test/app
rollback_hint=keep /opt/linan-test/app-backup-${short} before switching app directory
MANIFEST

printf '%s\n' "${archive}"
printf '%s\n' "${manifest}"
