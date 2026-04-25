---
description: Generate README + Pages workflow, commit, push, enable Pages, and set repo metadata
---

You will publish the current project to GitHub Pages and polish its repo metadata. Execute the steps below **in order**. Do not skip steps. Do not ask the user for confirmation between steps — they invoked this command knowing what it does.

## Pre-flight

1. Confirm we're inside a git repo and have a remote: `git remote get-url origin`. If no origin, stop and tell the user to set one.
2. Capture the repo identifier in `OWNER/REPO` form by parsing the origin URL. You'll need it for the `gh` calls and the final URL.
3. Confirm `gh auth status` succeeds. If not, stop and tell the user to run `gh auth login`.

## Step 1 — README.md

Write or overwrite `README.md` with a professional structure. Read the existing project files first (`index.html`, the main JS/CSS, `package.json` if any, and any existing CLAUDE.md) so the README reflects what the project actually does — do **not** fabricate features.

The README must include these sections in this order:

- `# <Project Name>` — derived from the repo name; convert hyphens to spaces and Title Case it.
- A one-paragraph description of what the project does and who it's for.
- `## Features` — bulleted list of concrete capabilities you observed in the code.
- `## Tech Stack` — bulleted list (languages, frameworks, key APIs/services). Mention if it's static HTML/CSS/JS, what build tool if any, and any third-party APIs.
- `## Setup` — numbered steps to run locally. Include any required config files or environment variables (read `.gitignore` to find files that must be created locally, e.g. `config.js`, `.env`).
- `## Screenshots` — a section with placeholder image references like `![Main view](docs/screenshots/main.png)` and a one-line note that screenshots can be dropped into `docs/screenshots/`.
- `## Live Demo` — link to `https://<owner>.github.io/<repo>/` (compute from the repo identifier).

Keep it scannable — short paragraphs, real bullets, no marketing fluff.

## Step 2 — GitHub Actions workflow

Create `.github/workflows/deploy.yml` for GitHub Pages deployment of a **static site** (no build step needed unless you detect one). Use the official Pages actions. The workflow must:

- Trigger on push to the default branch (detect via `git symbolic-ref refs/remotes/origin/HEAD` or fall back to `main`) and via `workflow_dispatch`.
- Have `permissions: pages: write, id-token: write, contents: read`.
- Have a `concurrency` group of `pages` with `cancel-in-progress: false`.
- Have one `build` job that checks out the repo and uploads the whole repo root as the Pages artifact (`actions/upload-pages-artifact@v3` with `path: '.'`).
- Have one `deploy` job that depends on `build`, uses `environment: name: github-pages, url: ${{ steps.deployment.outputs.page_url }}`, and runs `actions/deploy-pages@v4` with `id: deployment`.
- Use `actions/checkout@v4` and `actions/configure-pages@v5`.

If the project clearly has a build step (e.g. a `package.json` with a `build` script and a `dist/` or `build/` output), adjust the upload `path` accordingly and add the build step. Otherwise upload the repo root.

## Step 3 — Commit

Stage all changes with explicit paths (do not use `git add -A` blindly — but `git add .` is fine since `.gitignore` already excludes secrets; verify by running `git status` first and confirming no secret-looking files are staged). Commit with a descriptive multi-line message — first line summarizing the change ("Add GitHub Pages deployment + project README"), body explaining what was added.

If pre-commit hooks fail, fix the underlying issue and create a new commit — do not `--amend` or `--no-verify`.

## Step 4 — Push

`git push` to the current branch's upstream. If the branch has no upstream yet, push with `-u origin <branch>`.

## Step 5 — Enable GitHub Pages (Actions source)

Use `gh api` to enable Pages with the **GitHub Actions** build source. Pages may or may not already be enabled — handle both:

- Try `gh api -X POST "repos/$OWNER/$REPO/pages" -f build_type=workflow` first.
- If that returns 409 (already enabled), run `gh api -X PUT "repos/$OWNER/$REPO/pages" -f build_type=workflow` instead.

Don't fail the whole command if Pages was already configured correctly — just continue.

## Step 6 — Repo description and topics

Generate a concise (≤ 100 char) repo description from the README's first paragraph. Pick 4–6 relevant lowercase, hyphenated topics from the tech stack and project type (e.g. `lead-generation`, `apify`, `static-site`, `javascript`, `github-pages`).

Run a single `gh repo edit` call:

```
gh repo edit "$OWNER/$REPO" \
  --description "<description>" \
  --add-topic <topic1> --add-topic <topic2> --add-topic <topic3> ...
```

## Step 7 — Print the live URL

After all steps succeed, print **only** the final Pages URL on its own line, prefixed with "Live URL: ":

```
Live URL: https://<owner>.github.io/<repo>/
```

Note that the first deployment can take 1–2 minutes after the workflow run finishes — mention that in one short sentence after the URL.
