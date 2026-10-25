# Putting the translator online for testers

The whole app runs in one container: the Stanza parser, the engine, and the web
page, all on one address. The target is a free **Hugging Face Space** (Docker),
because the parser needs a few GB of memory and the free CPU tier has 16 GB.

## One-time setup (about 10 minutes)

1. **Make an account.** Sign up at https://huggingface.co/join.
2. **Create the Space.**
   - Open https://huggingface.co/new-space.
   - Name: e.g. `interslavic-translator`.
   - SDK: **Docker**, template **Blank**.
   - Hardware: **CPU basic (free)**.
   - Visibility: **Public**, so testers can open it without an account.
3. **Create an access token.**
   - Go to https://huggingface.co/settings/tokens and choose **New token**.
   - Role: **Write**. Copy it.
4. **Choose a password for reading reports.** In the Space, open **Settings → Variables
   and secrets → New secret**:
   - Name: `FEEDBACK_TOKEN`.
   - Value: any long random string. Keep it; you need it to download the reports.

## Publish (and re-publish after every change)

From the project folder:

```
sh deploy/huggingface.sh <your-username>/interslavic-translator
```

When git asks, give your Hugging Face **username** and paste the **token** as the
password.

The Space then builds itself.
- The first build takes roughly 10–20 minutes, mostly downloading PyTorch and the
  Stanza models.
- The **Logs** tab shows progress.
- When it says *Running*, the app is at:

```
https://<your-username>-interslavic-translator.hf.space
```

That is the link to send testers.

## Reading the testers' reports

Every report from the page's **Report a problem** button is one line in a file. To
download them, open:

```
https://<your-username>-interslavic-translator.hf.space/api/feedback?token=<FEEDBACK_TOKEN>
```

Save the result and hand it to Claude: each line has the sentence, our output, and
what the tester said is wrong.

**Reports survive only while the Space keeps running.**
- On the free tier, the Space sleeps after about 48 hours without visitors. On restart,
  the report file is lost.
- So download the reports regularly.
- Or add **persistent storage** in Settings (paid, the smallest tier is enough). The
  app then keeps reports in `/data` automatically.

## Things to know

- **First visit after a sleep is slow.** The parser loads its models on the first
  request, which takes up to a minute. The page says so if it is not ready yet.
- **The dictionary is fetched at build time** from its public source, so it may
  include edits made after the snapshot the tests were run on.
- **The dictionary is never copied into the Space's repository or served as a file.**
  It is Jan van Steenbergen's material, licensed for non-commercial use with
  attribution (see `docs/dictionary-provenance.md`). The page shows the attribution.
  - A free test site fits that.
  - Because the site is public, it is courteous to tell the dictionary's maintainers
    (interslavic-dictionary.com).
- **The Docker image has not been built on this machine.** Docker was not running,
  and the build would strain an 8 GB laptop. Every part of it was run directly
  instead: the production server serving the page, the API, the parser, and the
  feedback routes.
  - If the first build on Hugging Face fails, the **Logs** tab shows why.
  - Paste the log to Claude.
