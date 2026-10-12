"use strict";
(() => {
  let request = null;
  window.soundSpectrumSupport = function soundSpectrumSupport() {
    request ||= window.fetch("/api/soundspectrum/status", { cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(data => data?.supported === false ? false : data?.supported === true ? true : null, () => null);
    return request;
  };
})();
