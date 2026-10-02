/* =========================================================
   KEYS99 - HOW A VISITOR ARRIVED

   Loaded on every page. Remembers, in this browser only, how the
   visitor reached the site - the first page they saw, the site that
   sent them (google.com, instagram.com...) and any utm_ tags on the
   link - so an enquiry can say which page or campaign brought it.

   A new tagged link or a new visit from another site replaces the
   record; moving between pages of this site, or coming back
   directly, does not. Records expire after 30 days.

   Nothing is sent anywhere by this file. js/property-details.js
   adds Keys99Attribution.get() to the enquiry when the visitor
   submits the form (see the Privacy Policy, section 6).
========================================================= */

(function(){
  var KEY = "k99_attribution";
  var MAX_AGE = 30 * 24 * 60 * 60 * 1000;

  function cut(value, max){
    value = String(value == null ? "" : value).trim();
    return value ? value.slice(0, max) : null;
  }

  function read(){
    try{
      var saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if(saved && Date.now() - saved.t < MAX_AGE) return saved;
    }catch(_){}
    return null;
  }

  function write(record){
    try{ localStorage.setItem(KEY, JSON.stringify(record)); }catch(_){}
  }

  /* The other site's address without its query string, which can
     carry search terms or personal details. */
  function externalReferrer(){
    try{
      var ref = new URL(document.referrer);
      if(ref.host && ref.host !== location.host) return cut(ref.host + ref.pathname, 500);
    }catch(_){}
    return null;
  }

  var params = new URLSearchParams(location.search);
  var utm = {
    source: cut(params.get("utm_source"), 100),
    medium: cut(params.get("utm_medium"), 100),
    campaign: cut(params.get("utm_campaign"), 100)
  };
  var referrer = externalReferrer();

  if(!read() || utm.source || utm.medium || utm.campaign || referrer){
    write({
      t: Date.now(),
      landing: cut(location.pathname + location.search, 500),
      referrer: referrer,
      utm: utm
    });
  }

  window.Keys99Attribution = {
    /* Column names of residential_enquiries (supabase/04-enquiry-source.sql). */
    get: function(){
      var saved = read() || { utm: {} };
      return {
        page_url: cut(location.pathname + location.search, 500),
        landing_page: saved.landing || null,
        referrer: saved.referrer || null,
        utm_source: saved.utm.source || null,
        utm_medium: saved.utm.medium || null,
        utm_campaign: saved.utm.campaign || null
      };
    }
  };
})();
