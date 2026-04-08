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
- RCLONE_CONF
- RCLONE_REMOTE_PATH

## Local test
```bash
SITE_URL="https://www.example.com/" SITE_NAME="example" npm run capture
