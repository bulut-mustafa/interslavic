#!/bin/sh
# Build the site (prerendered pages, sitemap, robots.txt) and publish it to
# Firebase Hosting. The translator API is deployed separately to Cloud Run
# (see DEPLOY.md); this only changes the pages.
set -e
cd "$(dirname "$0")/.."
npm run web:build
python3 -I deploy/hosting.py
