# Deployment

The whole app runs in one container: the Stanza parser, the engine, and the web
page, all on one address. It is hosted on **Google Cloud Run**, which builds the
container in Google's cloud (nothing heavy runs on the laptop) and runs it only
while someone is using it.

Why Cloud Run: the parser needs about 1.7 GB of memory at its peak (measured:
parser 1.2 GB, engine 0.5 GB), which rules out free hosts with 512 MB or 1 GB.
That was with the English and Russian models. Ukrainian adds a third (317 MB of
model files; the image also installs simplemma for its lemma check). Measured on
Cloud Run (2026-10-30): 45% of 4 GiB with English and Russian, 51% (about
2.1 GB) with all three, so the 4 GiB below leaves about 2 GB spare.
Hugging Face made Docker Spaces paid in July 2026, and Oracle's free Ampere
servers were out of capacity in the account's home region.

## What is running

| | |
|---|---|
| Project | `interslavic-translator-08rmc` |
| Service | `interslavic`, region `europe-west1` |
| Public address | **https://interslavic.web.app** |
| Direct Cloud Run address | https://interslavic-8578650623.europe-west1.run.app |
| Size | 1 CPU, 4 GiB, at most **one** copy running (caps the cost) |
| Tester reports | bucket `interslavic-translator-08rmc-reports`, mounted at `/data` |
| Budget alert | 150 TRY (about 3 USD) a month, emails at 25%, 50% and 100% |

## The web.app address

`interslavic.web.app` is a Firebase Hosting site in the same project. It serves
the **pages** itself from Firebase's CDN - every page prerendered to HTML, plus
`sitemap.xml`, `robots.txt` and a real `404.html` - so a lesson opens at once
even while Cloud Run is asleep. Only `/api/**` is passed on to the Cloud Run
service (the translator and tester reports). Firebase gives up on a request
after 60 seconds; a cold start of the API measured about 40 seconds.

The routing lives in `deploy/hosting.py` (`CONFIG`): the `/api/**` rewrite, a
301 from `/learn` to `/learn/introduction`, no trailing slashes, and
`no-cache` on pages with long caching only for the hashed `/assets/` files.

## Re-publish after a change

**The pages** (lessons, phrasebook, anything in `packages/web`):

```
sh deploy/hosting.sh
```

Builds and prerenders the site and uploads it with the Firebase Hosting REST
API, using the `gcloud` login. It refuses to upload anything that is not a web
file, so the dictionary can never be published. Takes under a minute.

**The translator API** (anything in `packages/engine`, `server`, `lexicon`, ...):

```
gcloud run deploy interslavic --source . --region europe-west1
```

The build takes about 10–15 minutes and keeps every setting above.
- What is uploaded is decided by `.gcloudignore`, which reads `.dockerignore`.
  It is the same set of files as `git ls-files`; check with
  `gcloud meta list-files-for-upload`.
- The dictionary is never uploaded: the build fetches it from its public source.

## Reading the reports

Each report from the page's **Report a problem** button is one line in a file
that survives restarts. Open:

```
https://interslavic.web.app/api/feedback?token=<FEEDBACK_TOKEN>
```

`FEEDBACK_TOKEN` is set on the service; read it with
`gcloud run services describe interslavic --region europe-west1 --format=export | grep -A1 FEEDBACK_TOKEN`.
Without the right token the address answers 404.

## Things to know

- **First visit after a quiet spell is slow.** The service sleeps after about 15
  idle minutes. The first request then starts it and loads the language models;
  the page says it may still be starting up.
- **Cost.** Cloud Run's monthly free allowance covers testing use. The image
  storage (several GB, with 0.5 GB free) costs a few cents a month. The budget
  alert warns by email; it does not stop the service.
- **To stop all costs**, delete the project:
  `gcloud projects delete interslavic-translator-08rmc`.
- **The dictionary is fetched at build time**, so it may include edits made after
  the snapshot the tests were run on.
- **The dictionary is never served as a file.** It is Jan van Steenbergen's
  material, licensed for non-commercial use with attribution (see
  `docs/dictionary-provenance.md`). The page shows the attribution. Because the
  site is public, it is courteous to tell the dictionary's maintainers
  (interslavic-dictionary.com).
