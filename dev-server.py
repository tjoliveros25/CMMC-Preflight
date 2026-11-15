#!/usr/bin/env python3
"""Serve CMMC Preflight locally with the same headers Vercel will send.

    python dev-server.py            # http://localhost:3000
    python dev-server.py 8080       # a different port

Why not `npx serve` or opening index.html directly:

  - Opening index.html from disk does not work at all. The page loads JavaScript modules,
    which browsers refuse to load from a file:// path.
  - A plain static server works, but sends no Content-Security-Policy, so the Security
    page's "Attempt to send data" button will report that the request went out. This
    script reads vercel.json and applies the real headers, so what you see locally is
    what the deployed site does.

Needs nothing but Python 3.
"""

import http.server
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3000


def vercel_headers():
    try:
        with open(os.path.join(ROOT, "vercel.json"), encoding="utf-8") as handle:
            config = json.load(handle)
        return [(h["key"], h["value"]) for h in config["headers"][0]["headers"]]
    except (OSError, KeyError, IndexError, ValueError) as error:
        print(f"Could not read headers from vercel.json ({error}). Serving without them.")
        return []


HEADERS = vercel_headers()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        for key, value in HEADERS:
            self.send_header(key, value)
        # Never cache during development.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    print(f"CMMC Preflight at http://localhost:{PORT}")
    print(f"Serving {ROOT}")
    print(f"Headers applied: {', '.join(k for k, _ in HEADERS) or 'none'}")
    print("Press Ctrl+C to stop.")
    try:
        http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
