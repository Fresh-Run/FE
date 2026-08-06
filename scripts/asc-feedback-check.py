#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ASC TestFlight feedback check — the one-command detector (8/6 ruling).

Cadence (ledgered, standing): WEEKLY + immediately after any P1-class
promotion. Born from the 8/3→8/4 gap: the AIRMap P1's four crash
submissions sat unread because the "add a date to the ledger line each
check" habit was unwritten process — this command + schedule replaces it.

Usage:  python3 scripts/asc-feedback-check.py [--since YYYY-MM-DD]
Exit:   0 = no new crash submissions since --since (default: 7 days ago)
        1 = new crash submissions exist (read them, ledger them)
Needs:  ~/.freshrun-eas/AuthKey_SND9MTC84D.p8 (the eas-submit key, local
        machine only — deliberately NOT automatable from cloud).
"""
import argparse, datetime, json, os, sys, time, urllib.request

import jwt  # PyJWT (present in the toolchain)

KEY_ID = 'SND9MTC84D'
ISSUER = '55ed01ad-d164-4678-8bd0-621f0234f792'
APP = '6789668009'
KEY_PATH = os.path.expanduser('~/.freshrun-eas/AuthKey_SND9MTC84D.p8')


def token() -> str:
    with open(KEY_PATH) as f:
        key = f.read()
    now = int(time.time())
    return jwt.encode(
        {'iss': ISSUER, 'iat': now, 'exp': now + 900, 'aud': 'appstoreconnect-v1'},
        key, algorithm='ES256', headers={'kid': KEY_ID})


def get(path: str, tok: str):
    req = urllib.request.Request(
        'https://api.appstoreconnect.apple.com' + path,
        headers={'Authorization': 'Bearer ' + tok})
    return json.load(urllib.request.urlopen(req))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--since', default=None, help='YYYY-MM-DD (default: 7 days ago)')
    args = ap.parse_args()
    since = args.since or (datetime.date.today() - datetime.timedelta(days=7)).isoformat()

    tok = token()
    new_crashes = 0
    for name, path in [
        ('screenshot feedback', f'/v1/apps/{APP}/betaFeedbackScreenshotSubmissions?limit=50'),
        ('crash feedback', f'/v1/apps/{APP}/betaFeedbackCrashSubmissions?limit=50'),
    ]:
        rows = get(path, tok).get('data', [])
        fresh = [r for r in rows if (r.get('attributes', {}).get('createdDate') or '') >= since]
        print(f'{name}: {len(rows)} total · {len(fresh)} since {since}')
        for r in fresh:
            a = r.get('attributes', {})
            print(f"   {a.get('createdDate', '')}  {str(a.get('comment', '')).strip()[:80]!r}")
        if 'crash' in name:
            new_crashes = len(fresh)
    if new_crashes:
        print(f'\n⚠️  {new_crashes} new crash submission(s) — read, triage, LEDGER them.')
        return 1
    print('\nclean — no new crash submissions in the window.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
