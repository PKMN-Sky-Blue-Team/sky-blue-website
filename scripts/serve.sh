#!/usr/bin/env bash
# Builds the site and serves it at http://127.0.0.1:4000/sky-blue-website/,
# rebuilding and reloading the browser whenever a file changes.
# Any extra arguments are passed to `jekyll serve` (e.g. --drafts, --port 4001).
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v ruby >/dev/null 2>&1; then
  echo "Ruby is not installed. See 'Testing locally' in README.md." >&2
  exit 1
fi
if ! command -v bundle >/dev/null 2>&1; then
  echo "Bundler is not installed. Run: gem install --user-install bundler" >&2
  echo "(see 'Testing locally' in README.md)" >&2
  exit 1
fi

# Install gems inside the project (vendor/bundle) so sudo is never needed.
bundle config set --local path vendor/bundle >/dev/null
bundle check >/dev/null 2>&1 || bundle install

exec bundle exec jekyll serve --livereload "$@"
