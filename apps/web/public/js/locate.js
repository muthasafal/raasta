/* Raasta location helper. Plain ES5 so it runs on old phones. Shared by the static site and the Worker pages.
   - [data-locate] button: asks for GPS, rounds to 3 decimals (about 100 m), reverse geocodes on our server, fills
     the surrounding form's state and city fields and submits it (the server stores only state and city in a cookie).
   - [data-loc-label]: shows the saved city or state from the raasta_loc cookie. */
(function () {
  function readLoc() {
    var m = document.cookie.match(/(?:^|; )raasta_loc=([^;]*)/);
    if (!m) return null;
    var parts = decodeURIComponent(m[1]).split("|");
    return { state: parts[0] || "", city: parts[1] || "" };
  }

  function showSaved() {
    // GPS buttons start hidden so pages without JS never show a dead button.
    if (navigator.geolocation) {
      var btns = document.querySelectorAll("[data-locate][hidden]");
      for (var b = 0; b < btns.length; b++) btns[b].removeAttribute("hidden");
    }
    var loc = readLoc();
    // Forms that ask for a state start on the saved one, so people do not have to pick it again.
    if (loc && loc.state) {
      var sels = document.querySelectorAll("select[data-loc-state]");
      for (var k = 0; k < sels.length; k++) {
        if (sels[k].value) continue;
        for (var o = 0; o < sels[k].options.length; o++) {
          if (sels[k].options[o].value.toUpperCase() === loc.state.toUpperCase()) sels[k].selectedIndex = o;
        }
      }
    }
    if (!loc || !(loc.city || loc.state)) return;
    var labels = document.querySelectorAll("[data-loc-label]");
    for (var i = 0; i < labels.length; i++) labels[i].textContent = loc.city || loc.state;
    var chips = document.querySelectorAll("[data-loc-chip]");
    for (var j = 0; j < chips.length; j++) chips[j].className += " is-set";
  }

  function setStatus(form, text) {
    var s = form.querySelector("[data-locate-status]");
    if (s) s.textContent = text;
  }

  function locate(btn) {
    var form = btn.form || btn.closest("form");
    if (!form) return;
    var msg = {
      busy: btn.getAttribute("data-msg-busy") || "Finding you...",
      denied: btn.getAttribute("data-msg-denied") || "Location is off. Type your city instead.",
      fail: btn.getAttribute("data-msg-fail") || "Could not find your place. Type your city instead."
    };
    if (!navigator.geolocation) {
      setStatus(form, msg.fail);
      return;
    }
    btn.disabled = true;
    setStatus(form, msg.busy);
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var lat = Math.round(pos.coords.latitude * 1000) / 1000;
        var lng = Math.round(pos.coords.longitude * 1000) / 1000;
        // Directions forms take the rounded start point directly (no reverse geocode needed).
        var from = form.querySelector("[name=from]");
        if (from) {
          from.value = lat + "," + lng;
          btn.disabled = false;
          form.submit();
          return;
        }
        // Office search can use the exact point for "nearest first".
        var la = form.querySelector("[name=lat]");
        var ln = form.querySelector("[name=lng]");
        if (la && ln) {
          la.value = lat;
          ln.value = lng;
        }
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "/api/geo/reverse?lat=" + lat + "&lng=" + lng);
        xhr.onload = function () {
          btn.disabled = false;
          try {
            var r = JSON.parse(xhr.responseText);
            var st = form.querySelector("[name=state]");
            // Guided questions that ask for the city mark their input with a [data-loc-city] wrapper.
            var ct = form.querySelector("[name=city]") || form.querySelector("[data-loc-city] input, input[data-loc-city]");
            if (st) st.value = r.state_code || r.state || "";
            if (ct) ct.value = r.district || r.city || "";
            if (r.state || r.city || (la && ln)) form.submit();
            else setStatus(form, msg.fail);
          } catch (e) {
            setStatus(form, msg.fail);
          }
        };
        xhr.onerror = function () {
          btn.disabled = false;
          setStatus(form, msg.fail);
        };
        xhr.send();
      },
      function (err) {
        btn.disabled = false;
        setStatus(form, err && err.code === 1 ? msg.denied : msg.fail);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 }
    );
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    while (t && t !== document) {
      if (t.getAttribute && t.getAttribute("data-locate") !== null) {
        e.preventDefault();
        locate(t);
        return;
      }
      t = t.parentNode;
    }
  });

  /* Case details. When someone describes their problem (forms that post to /r/ask or /r/chat), pick out the few facts a
     later letter needs (their own name, phone and email, the other party, the bank, a transaction id, an IMEI) and keep
     only those, on this device, for 7 days (localStorage raasta_case). The problem text itself is never stored, and
     nothing here is sent anywhere. The letter pages (enhance.js) fill empty fields from it. */
  var CASE_KEY = "raasta_case";
  var CASE_TTL = 7 * 86400000;
  var NOT_NAME = /^(Not|No|Very|So|Too|In|At|From|On|The|A|An|Being|Getting|Facing|Living|Working|Unable|Staying|Also|Just|Really|Here|Writing|Asking|Trying|Looking|Owed|Owner|Tenant|Student|Worker|Employee|Customer|Victim|Sorry|Afraid|Scared|Worried|Upset|Tired|Fine|Ok|Okay)$/;
  var NAME = "([A-Z][A-Za-z.'&-]*(?: (?:[A-Z][A-Za-z.'&-]*|Pvt|Ltd|and|&)){0,3})";
  var HON_REQ = "(?:Mr|Mrs|Ms|Dr|Smt|Shri|Sri|Shree)\\.? ";
  var HON = "(?:" + HON_REQ + ")?";
  // "landlord" also matches "Landlord" at the start of a sentence, while names stay case sensitive.
  function anyCase(alts) {
    return alts.replace(/(^|\|)([a-z])/g, function (_m, bar, ch) {
      return bar + "[" + ch.toUpperCase() + ch + "]";
    });
  }
  var ROLES = [
    ["owner", "landlord|house owner|flat owner|room owner|owner|makan malik"],
    ["employer", "employer|boss|manager|supervisor|contractor|principal|head|company|firm|office"],
    ["builder", "builder|developer|promoter"],
    ["seller", "seller|shopkeeper|shop|store|dealer|showroom|vendor|merchant"],
    ["neighbour", "neighbour|neighbor"]
  ];
  var BANKS = /\b((?:SBI|HDFC|ICICI|Axis|Kotak|PNB|IDFC First|IndusInd|Canara)(?: Bank)?|Yes Bank|Bank of Baroda|Bank of India|Bank of Maharashtra|Union Bank|Federal Bank|Indian Bank|Central Bank|Paytm Payments Bank|Airtel Payments Bank|[A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)? Bank)\b/;

  function cleanName(s) {
    // A full stop after a word ends the sentence ("I am Ravi Kumar. My employer..."), except in "Pvt. Ltd."
    s = (s || "").replace(/\b([A-Za-z]{3,})\. .*$/, function (m, w) {
      return /^(Pvt|Ltd|Co)$/.test(w) ? m : w;
    });
    s = s.replace(/[\s.,]+$/, "").replace(/ (and|&)$/, "");
    var first = s.split(" ")[0].replace(/\.$/, "");
    if (!s || NOT_NAME.test(first) || s.length > 80) return "";
    return s;
  }

  function pickDetails(text) {
    var out = {};
    if (!text) return out;
    text = String(text).slice(0, 2000);
    var m = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    if (m) out.email = m[0];
    m = text.match(/(?:^|[^\d])(?:\+?91[\s-]?)?([6-9]\d{4})[\s-]?(\d{5})(?!\d)/);
    if (m) out.phone = m[1] + m[2];
    m = text.match(new RegExp("(?:[Mm]y name is|[Mm]yself|I am|I'm|i am|i'm|[Nn]ame:)\\s+" + HON + NAME));
    if (m && cleanName(m[1])) out.name = cleanName(m[1]);
    if (!out.name) {
      m = text.match(/(?:mera naam|maza nav|majhe nav|माझे नाव|माझं नाव|मेरा नाम)\s+([^\s,.।]+(?:\s+[^\s,.।]+)?)\s+(?:hai|aahe|है|आहे)/i);
      if (m) out.name = m[1];
    }
    var party = {};
    for (var r = 0; r < ROLES.length; r++) {
      var roles = anyCase(ROLES[r][1]);
      m = text.match(new RegExp("\\b(?:" + roles + ")(?:,| is| was| named| called| name is|:)?\\s+" + HON + NAME));
      if (m && cleanName(m[1])) party[ROLES[r][0]] = cleanName(m[1]);
      if (!party[ROLES[r][0]]) {
        // "Shri Ramesh Patil, my landlord": the name comes first, so it needs a title to be sure it is a person.
        m = text.match(new RegExp(HON_REQ + NAME + ",? (?:my|our|the) (?:" + ROLES[r][1] + ")\\b"));
        if (m && cleanName(m[1])) party[ROLES[r][0]] = cleanName(m[1]);
      }
      if (party[ROLES[r][0]] && !party.other) party.other = party[ROLES[r][0]];
    }
    m = text.match(BANKS);
    if (m && !/^(My|The|Our|Your|A|Of) /.test(m[1])) party.bank = m[1];
    m = text.match(/\b(?:UTR|transaction id|transaction no\.?|txn id|txn no\.?|reference no\.?|ref no\.?)[\s:#.-]*([A-Za-z0-9]{8,24})\b/i);
    if (m && /\d/.test(m[1])) out.txn = m[1];
    m = text.match(/\bIMEI(?: number| no\.?)?[\s:#.-]*(\d{15})\b/i);
    if (m) out.imei = m[1];
    for (var k in party) if (party.hasOwnProperty(k)) out[k] = party[k];
    return out;
  }
  window.raastaPickDetails = pickDetails;

  function readCase() {
    try {
      var c = JSON.parse(localStorage.getItem(CASE_KEY) || "null");
      if (!c || !c.at || Date.now() - c.at > CASE_TTL) {
        if (c) localStorage.removeItem(CASE_KEY);
        return {};
      }
      return c.d || {};
    } catch (e) {
      return {};
    }
  }
  window.raastaReadCase = readCase;

  document.addEventListener("submit", function (e) {
    var f = e.target;
    var a = f && f.getAttribute ? f.getAttribute("action") || "" : "";
    if (a.indexOf("/r/ask") !== 0 && a.indexOf("/r/chat") !== 0) return;
    var ta = f.querySelector("textarea[name=text], textarea[name=q], input[name=text]");
    if (!ta || !ta.value) return;
    var got = pickDetails(ta.value);
    // A new problem from the home page starts a fresh case; follow-up chat questions add to the current one.
    var d = a.indexOf("/r/ask") === 0 ? {} : readCase();
    var keys = 0;
    for (var j in got) if (got.hasOwnProperty(j)) d[j] = got[j];
    for (var k in d) if (d.hasOwnProperty(k)) keys++;
    try {
      if (keys) localStorage.setItem(CASE_KEY, JSON.stringify({ at: Date.now(), d: d }));
      else localStorage.removeItem(CASE_KEY);
    } catch (err) {
      /* storage blocked: the letter is simply not prefilled */
    }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", showSaved);
  else showSaved();
})();
