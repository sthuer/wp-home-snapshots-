# WP Home Snapshots

Automated screenshots of the homepage for archival/reference purposes.

## What it does
- Opens the homepage with Playwright
- Waits for the page to settle
- Captures:
  - top screenshot
  - full-page screenshot
- Uploads files to Google Drive or OneDrive using rclone
- Runs on GitHub Actions every Monday and Thursday
- Can also be triggered manually

## Required GitHub Secrets
- SITE_URL
- SITE_NAME
- WP_USERNAME
- WP_PASSWORD
- RCLONE_CONF
- RCLONE_REMOTE_PATH

## Optional GitHub Secrets
- WP_LOGIN_URL: custom login URL. Defaults to `/wp-login.php` on `SITE_URL`.
- BLOCKING_MODAL_SELECTOR: CSS selector for the subscription modal that must not be visible before screenshots. Defaults to `#pmsm-modal:not([hidden])`.
- EXPECTED_MODAL_SELECTOR: deprecated alias for `BLOCKING_MODAL_SELECTOR`, kept for existing GitHub secrets.
- NON_REGISTERED_MESSAGE_TEXT: text or regex used to detect the non-registered-user message. Defaults to common Spanish/English variants.

The workflow stores Playwright `storageState` in the GitHub Actions cache and regenerates it with `WP_USERNAME` and `WP_PASSWORD` when the session expires. Authentication files, cookies and local env files are ignored by Git.

## Modified files
- `scripts/capture-home.js`: adds persistent Playwright authentication, session regeneration, pre-capture validation and diagnostic screenshots on failure.
- `.github/workflows/snapshot.yml`: passes authentication secrets, restores cached `storageState` and uploads diagnostics when capture fails.
- `.gitignore`: ignores local authentication state files.
- `README.md`: documents the required and optional secrets.

## Local test
```bash
SITE_URL="https://www.example.com/" SITE_NAME="example" WP_USERNAME="user" WP_PASSWORD="password" npm run capture
```
