#!/bin/sh
# Blocks commits that would publish private data — this repo is public.
# Installed with: git config core.hooksPath .githooks
#
#   check-private.sh staged        — staged files and added lines (pre-commit)
#   check-private.sh message FILE  — a commit message (commit-msg)
#
# Generic patterns live here. Personal terms (your name, company names,
# hostnames…) go one per line in .git/info/private-terms, which is inside
# .git and so never committed or pushed. Bypass only knowingly: --no-verify.

mode="$1"
terms_file="$(git rev-parse --git-dir)/info/private-terms"

# Credentials, contact details (emails, Swedish mobile numbers) and
# personal identity numbers. macOS grep has no \\b, hence the explicit
# non-digit boundaries. Placeholders like
# mongodb+srv://<user>:<password>@ don't match.
patterns='mongodb(\+srv)?://[^<[:space:]/]+:[^<[:space:]@]+@
AIza[0-9A-Za-z_-]{30,}
sk-ant-[A-Za-z0-9_-]{10,}
gh[pousr]_[A-Za-z0-9]{20,}
(^|[^0-9a-f])[0-9a-f]{40,}([^0-9a-f]|$)
-----BEGIN [A-Z ]*PRIVATE KEY
[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[a-z]{2,}
(\+46 ?|(^|[^0-9])0)7[0-9][ -]?[0-9]{3}[ -]?[0-9]{2}[ -]?[0-9]{2}([^0-9]|$)
(^|[^0-9])(19|20)?[0-9]{6}[-+][0-9]{4}([^0-9]|$)'

# Addresses that are fine to publish.
allowed_emails='noreply@anthropic\.com|@users\.noreply\.github\.com|@example\.(com|org)'

fail=0
report() {
  echo "✗ $1" >&2
  fail=1
}

check_text() { # $1 = label, stdin = text
  text=$(cat)
  echo "$patterns" | while IFS= read -r re; do
    [ -z "$re" ] && continue
    hits=$(printf '%s\n' "$text" | grep -E -o -- "$re" | grep -E -v -- "$allowed_emails" | head -3)
    [ -n "$hits" ] && printf '✗ %s: looks private (%s)\n' "$1" "$(echo "$hits" | tr '\n' ' ')" >&2
  done
  if [ -f "$terms_file" ]; then
    grep -v '^[[:space:]]*\(#\|$\)' "$terms_file" | while IFS= read -r term; do
      printf '%s\n' "$text" | grep -F -i -q -- "$term" && printf '✗ %s: contains a private term from .git/info/private-terms\n' "$1" >&2
    done
  fi
}

if [ "$mode" = "message" ]; then
  out=$(check_text "commit message" < "$2" 2>&1)
  [ -n "$out" ] && echo "$out" >&2 && fail=1
else
  email=$(git config user.email)
  case "$email" in
    *@users.noreply.github.com) ;;
    *) report "author email $email would be published — use your GitHub noreply address: git config user.email <id>+<login>@users.noreply.github.com" ;;
  esac

  for f in $(git diff --cached --name-only --diff-filter=ACMR); do
    case "$f" in
      profile/*|logs/*|backups/*|*.db|*.db-*|*.sqlite|*.sqlite3|*.bak|*.backup|*.local|*.pem|atlas-credentials*|*/.vercel/*|.vercel/*)
        report "$f: private file (profile, data, logs, backups or credentials)" ;;
      .env.example) ;;
      .env*|*/.env*) report "$f: env file" ;;
    esac
  done

  out=$(git diff --cached -U0 --diff-filter=ACMR -- . ':!package-lock.json' ':!.githooks/check-private.sh' \
    | grep -E '^\+' | grep -v -E '^\+\+\+ ' | check_text "staged changes" 2>&1)
  [ -n "$out" ] && echo "$out" >&2 && fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "Commit blocked: this repo is public. Remove the above, or commit with --no-verify if you're sure." >&2
  exit 1
fi
exit 0
