"use strict";

(() => {
  const BUTTON_CLASS = "rblx-web-play-button";
  const CONTAINER_ID = "game-details-play-button-container";
  let scheduled = false;

  function currentPlaceId() {
    if (location.origin !== "https://www.roblox.com") return null;
    const match = /^\/games\/([1-9]\d*)(?:\/|$)/.exec(location.pathname);
    if (!match || !Number.isSafeInteger(Number(match[1]))) return null;
    return match[1];
  }

  function makeGlobe() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "26");
    svg.setAttribute("height", "26");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.9");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    for (const shape of [
      ["circle", { cx: "12", cy: "12", r: "9" }],
      ["path", { d: "M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9M12 3c-2.4 2.5-3.6 5.5-3.6 9s1.2 6.5 3.6 9" }]
    ]) {
      const element = document.createElementNS("http://www.w3.org/2000/svg", shape[0]);
      for (const [name, value] of Object.entries(shape[1])) element.setAttribute(name, value);
      svg.appendChild(element);
    }
    return svg;
  }

  function update() {
    const placeId = currentPlaceId();
    const container = document.getElementById(CONTAINER_ID);
    const play = container?.querySelector('[data-testid="play-button"]');
    if (!placeId || !play) {
      document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => button.remove());
      return;
    }

    const existing = container.querySelector(`.${BUTTON_CLASS}`);
    if (existing?.dataset.placeId === placeId) return;
    existing?.remove();

    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.dataset.placeId = placeId;
    button.setAttribute("aria-label", "Play in browser");
    button.title = "Play in browser";
    button.appendChild(makeGlobe());
    button.addEventListener("click", () => {
      const target = new URL("https://play.roblox.com/games/start");
      target.searchParams.set("placeId", placeId);
      target.searchParams.set("returnUrl", location.origin + location.pathname);
      location.assign(target.href);
    });
    container.appendChild(button);
  }

  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      update();
    });
  }

  new MutationObserver(scheduleUpdate).observe(document, { childList: true, subtree: true });
  window.addEventListener("popstate", scheduleUpdate);
  scheduleUpdate();
})();
