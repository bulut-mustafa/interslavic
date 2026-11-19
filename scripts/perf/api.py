"""
How fast the translator's API answers, with the server already running
(npm run server, and the parser). Median of three runs of each size.

    npm run perf:api
"""
import json
import time
import urllib.request

BASE = "http://127.0.0.1:8766"
LINES = ["Welcome to our shop.", "We open every day at nine.", "Come and see our new things.",
         "Thank you very much for coming today.", "Do you have any questions about the menu?"] * 10


def post(path, body):
    request = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), headers={"content-type": "application/json"})
    start = time.time()
    urllib.request.urlopen(request, timeout=300).read()
    return time.time() - start


post("/api/translate-batch", {"lines": LINES[:2], "lang": "en", "script": "standard"})  # warm
print("translate-batch")
for n in (1, 5, 20, 50):
    runs = sorted(post("/api/translate-batch", {"lines": LINES[:n], "lang": "en", "script": "standard"}) for _ in range(3))
    print(f"  {n:>3} lines  {runs[1] * 1000:7.0f} ms   {runs[1] * 1000 / n:5.0f} ms/line")
text = " ".join(["Otec kupil knigu i dal ju sestre."] * 20)
runs = sorted(post("/api/analyze", {"text": text}) for _ in range(3))
print(f"analyze, 20 sentences  {runs[1] * 1000:.0f} ms")
