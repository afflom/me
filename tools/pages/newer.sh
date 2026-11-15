#!/usr/bin/env bash
# Whether $SHA is newer than the page that is live, so publishing it moves
# the site forward. Prints go=true or go=false for $GITHUB_OUTPUT.
#
# Main's runs go side by side and each takes a different time, so "is this
# still main's head" starves the site: when merges come faster than a run,
# every run finds main moved on and none publishes (#97 to #102 did this for
# ninety minutes). Instead a run publishes whenever the live page does not
# already hold its commit, and the publish job, which runs one at a time,
# asks again just before it deploys, so an older run never replaces a newer
# page.
set -euo pipefail
: "${REPO:?}" "${SHA:?}"
live=
while read -r id sha; do
  [[ -n $id ]] || continue
  state=$(gh api "repos/$REPO/deployments/$id/statuses?per_page=1" --jq '.[0].state // empty')
  if [[ $state == success ]]; then
    live=$sha
    break
  fi
done < <(gh api "repos/$REPO/deployments?environment=github-pages&per_page=30" --jq '.[] | "\(.id) \(.sha)"')
if [[ -z $live ]]; then
  echo "no live page found: publishing $SHA" >&2
  echo "go=true"
  exit 0
fi
# compare/BASE...HEAD: "ahead" or "identical" means the live commit already
# holds this one.
status=$(gh api "repos/$REPO/compare/$SHA...$live" --jq .status)
case $status in
  ahead|identical)
    echo "::notice::the live page ($live) already holds $SHA: a newer run published it" >&2
    echo "go=false"
    ;;
  *)
    echo "the live page is $live ($status of $SHA): publishing $SHA" >&2
    echo "go=true"
    ;;
esac
