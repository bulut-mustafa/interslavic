"""
Publish packages/web/dist to Firebase Hosting (interslavic.web.app).

The pages are served from Firebase's CDN, so a lesson opens at once even while
the translator service on Cloud Run is asleep; only /api/** is passed on to
Cloud Run. Uses the Firebase Hosting REST API with the gcloud login already on
this machine - no Firebase CLI and no extra sign-in.

    sh deploy/hosting.sh          (builds the site first, then runs this)

Refuses to upload anything that is not part of a web page: the dictionary
(words.tsv) must never be published, and dist is checked file by file.
"""
import gzip
import hashlib
import json
import pathlib
import subprocess
import sys
import urllib.request

PROJECT = 'interslavic-translator-08rmc'
SITE = 'interslavic'
API = 'https://firebasehosting.googleapis.com/v1beta1'
DIST = pathlib.Path(__file__).resolve().parent.parent / 'packages' / 'web' / 'dist'
ALLOWED = {'.html', '.js', '.css', '.svg', '.png', '.ico', '.xml', '.txt', '.woff2'}

CONFIG = {
    'trailingSlashBehavior': 'REMOVE',
    'redirects': [{'path': '/learn', 'location': '/learn/introduction', 'statusCode': 301}],
    'rewrites': [{'glob': '/api/**', 'run': {'serviceId': 'interslavic', 'region': 'europe-west1'}}],
    'headers': [
        {'glob': '/assets/**', 'headers': {'Cache-Control': 'public, max-age=31536000, immutable'}},
        {'glob': '**/*.html', 'headers': {'Cache-Control': 'no-cache'}},
    ],
}

token = subprocess.run(['gcloud', 'auth', 'print-access-token'], check=True, capture_output=True, text=True).stdout.strip()


def call(method, url, body=None, raw=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method, headers={
        'Authorization': f'Bearer {token}',
        'x-goog-user-project': PROJECT,
        'Content-Type': 'application/octet-stream' if raw is not None else 'application/json',
    })
    with urllib.request.urlopen(req) as res:
        text = res.read().decode()
        return json.loads(text) if text else {}


files = sorted(p for p in DIST.rglob('*') if p.is_file())
bad = [str(p.relative_to(DIST)) for p in files if p.suffix not in ALLOWED or p.name == 'words.tsv']
if bad:
    sys.exit(f'refusing to publish files that are not part of the page: {bad}')
if not (DIST / '404.html').exists() or not (DIST / 'learn').is_dir():
    sys.exit('dist is not prerendered - run "npm run web:build" first')

gz = {}
hashes = {}
for p in files:
    blob = gzip.compress(p.read_bytes(), mtime=0)
    digest = hashlib.sha256(blob).hexdigest()
    gz[digest] = blob
    hashes['/' + str(p.relative_to(DIST))] = digest

version = call('POST', f'{API}/sites/{SITE}/versions', {'config': CONFIG})['name']
need = call('POST', f'{API}/{version}:populateFiles', {'files': hashes})
for digest in need.get('uploadRequiredHashes', []):
    call('POST', f"{need['uploadUrl']}/{digest}", raw=gz[digest])
call('PATCH', f'{API}/{version}?update_mask=status', {'status': 'FINALIZED'})
call('POST', f'{API}/sites/{SITE}/releases?versionName={version}', {})
print(f'released {len(files)} files ({len(need.get("uploadRequiredHashes", []))} uploaded) as {version}')
