#!/bin/sh
# Roll out one release on this server. Run by CI over SSH:
#   IMAGE_PREFIX=ghcr.io/owner/feedback IMAGE_TAG=<git sha> ./deploy.sh
# The app's secrets live in .env next to this script and never pass through CI.
set -eu

: "${IMAGE_PREFIX:?IMAGE_PREFIX is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"
cd "$(dirname "$0")"
[ -f .env ] || { echo "Missing .env - copy .env.example and fill it in" >&2; exit 1; }

# The candidate release goes in release.env.next. It only becomes release.env (the
# record of what's live, used by later "docker compose ps/logs") once it succeeds.
printf 'IMAGE_PREFIX=%s\nIMAGE_TAG=%s\n' "$IMAGE_PREFIX" "$IMAGE_TAG" > release.env.next
compose() { docker compose -f docker-compose.prod.yml --env-file .env --env-file release.env.next "$@"; }

echo "==> Pulling $IMAGE_TAG"
compose pull --quiet

# Migrate BEFORE switching code. If it fails, set -e stops here and the old
# version keeps serving traffic untouched.
echo "==> Migrating database"
compose up -d --wait db
compose run --rm migrate

echo "==> Starting new version"
compose up -d --wait --remove-orphans

mv release.env.next release.env
docker image prune -f >/dev/null
echo "==> Live: $IMAGE_TAG"
