"use strict";

(() => {
  if (location.origin !== "https://play.roblox.com" ||
      location.pathname !== "/games/start") return;

  const placeId = new URLSearchParams(location.search).get("placeId");
  if (!/^[1-9]\d*$/.test(placeId || "") ||
      !Number.isSafeInteger(Number(placeId))) return;

  function installJoinPatch(scope) {
    const Xhr = scope.XMLHttpRequest;
    if (!Xhr?.prototype) return;

    const JOIN_ORIGIN = "https://gamejoin.roblox.com";
    const JOIN_PATHS = new Set([
      "/v1/join-game",
      "/v1/join-game-instance",
      "/v1/join-reserved-game",
      "/v1/join-private-game"
    ]);
    const DOMAIN = "qdmux.roblox.com";
    const states = new WeakMap();
    const proto = Xhr.prototype;
    const originalOpen = proto.open;
    const originalSetHeader = proto.setRequestHeader;
    const originalSend = proto.send;
    const responseDescriptor = Object.getOwnPropertyDescriptor(proto, "response");
    if (!responseDescriptor?.configurable || !responseDescriptor.get) return;

    function ipv4Parts(value) {
      if (typeof value !== "string") throw new Error("Missing IPv4 address");
      const parts = value.split(".").map(Number);
      if (parts.length !== 4 || parts.some((part) =>
        !Number.isInteger(part) || part < 0 || part > 255)) {
        throw new Error("Invalid IPv4 address");
      }
      return parts;
    }

    function ipv4Hex(parts) {
      return parts.map((part) => part.toString(16).padStart(2, "0")).join("");
    }

    function tokenHex(value) {
      if (typeof value !== "string") throw new Error("Missing network token");
      if (/^[0-9a-f]{32}$/i.test(value)) return value.toLowerCase();
      let binary;
      try {
        binary = atob(value);
      } catch {
        throw new Error("Invalid network token encoding");
      }
      if (binary.length !== 16) throw new Error("Invalid network token length");
      return Array.from(binary, (character) =>
        character.charCodeAt(0).toString(16).padStart(2, "0")).join("");
    }

    function patchResponse(raw) {
      let response;
      try {
        response = JSON.parse(raw);
      } catch {
        return null;
      }
      if (response?.status !== 2) return null;

      const scriptIsString = typeof response.joinScript === "string";
      let joinScript;
      try {
        joinScript = scriptIsString ? JSON.parse(response.joinScript) : response.joinScript;
      } catch {
        return null;
      }
      if (!joinScript || typeof joinScript !== "object" || joinScript.gameFqdn) {
        return null;
      }

      try {
        const nativeVip = ipv4Parts(joinScript.UdmuxEndpoints?.[0]?.Address);
        if (nativeVip[3] % 2 !== 1 || nativeVip[3] === 255) return null;
        const browserVip = [...nativeVip];
        browserVip[3] += 1;
        const machine = ipv4Parts(joinScript.MachineAddress);
        const port = Number(joinScript.NetStackPort);
        if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

        joinScript.gameFqdn = `${tokenHex(joinScript.NetStackTokenValue)}-` +
          `${ipv4Hex(machine)}-${port.toString(16).padStart(4, "0")}.` +
          `${ipv4Hex(browserVip)}.${DOMAIN}`;
        response.joinScript = scriptIsString ? JSON.stringify(joinScript) : joinScript;
        return JSON.stringify(response);
      } catch {
        return null;
      }
    }

    proto.open = function (method, url, ...rest) {
      let join = false;
      try {
        const parsed = new URL(String(url), scope.location.href);
        join = String(method).toUpperCase() === "POST" &&
          parsed.origin === JOIN_ORIGIN && JOIN_PATHS.has(parsed.pathname);
      } catch {
        // Let the browser handle an invalid URL as it normally would.
      }
      states.set(this, { join, headerSet: false, original: null, patched: null });
      return originalOpen.call(this, method, url, ...rest);
    };

    proto.setRequestHeader = function (name, value) {
      const state = states.get(this);
      if (state?.join && String(name).toLowerCase() === "rbx-user-agent") {
        if (state.headerSet) return;
        state.headerSet = true;
        value = "Roblox/Darwin";
      }
      return originalSetHeader.call(this, name, value);
    };

    proto.send = function (body) {
      const state = states.get(this);
      if (state?.join && !state.headerSet) {
        originalSetHeader.call(this, "rbx-user-agent", "Roblox/Darwin");
        state.headerSet = true;
      }
      return originalSend.call(this, body);
    };

    Object.defineProperty(proto, "response", {
      configurable: true,
      enumerable: responseDescriptor.enumerable,
      get() {
        const original = responseDescriptor.get.call(this);
        const state = states.get(this);
        if (!state?.join || this.readyState !== 4 || this.status !== 200 ||
            !(original instanceof ArrayBuffer)) return original;
        if (state.original === original) return state.patched;
        state.original = original;
        const body = patchResponse(new TextDecoder().decode(original));
        state.patched = body === null ? original : new TextEncoder().encode(body).buffer;
        return state.patched;
      }
    });
  }

  installJoinPatch(window);

  const NativeWorker = window.Worker;
  if (typeof NativeWorker === "function") {
    const workerUrls = new Set();
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        let engineUrl = null;
        try {
          const stub = new URL(String(url), location.href);
          const source = new URL(stub.searchParams.get("src") || "");
          if (stub.origin === location.origin &&
              stub.pathname.endsWith("/assets/webclient/stub.js") &&
              options?.name === "em-pthread" &&
              source.origin === "https://setup.rbxcdn.com" &&
              /^\/webclient\/[^/]+\/WebClient\.js$/.test(source.pathname)) {
            engineUrl = source.href;
          }
        } catch {
          // Other workers keep their normal URL and constructor behavior.
        }
        if (!engineUrl) {
          super(url, options);
          return;
        }

        const bootstrap = `(${installJoinPatch.toString()})(self);\n` +
          `importScripts(${JSON.stringify(engineUrl)});`;
        const blobUrl = URL.createObjectURL(new Blob([bootstrap], {
          type: "text/javascript"
        }));
        try {
          super(blobUrl, options);
          workerUrls.add(blobUrl);
        } catch (error) {
          URL.revokeObjectURL(blobUrl);
          throw error;
        }
      }
    };
    window.addEventListener("pagehide", () => {
      for (const url of workerUrls) URL.revokeObjectURL(url);
      workerUrls.clear();
    }, { once: true });
  }

  const fallbackUrl = `https://www.roblox.com/games/${placeId}`;
  let returnUrl = fallbackUrl;
  try {
    const supplied = new URL(new URLSearchParams(location.search).get("returnUrl"));
    if (supplied.origin === "https://www.roblox.com" &&
        supplied.pathname.startsWith(`/games/${placeId}/`) &&
        !supplied.username && !supplied.password) {
      returnUrl = supplied.origin + supplied.pathname;
    }
  } catch {
    // Direct Web Play links return to the matching game details page.
  }

  let resolveGameExit;
  Object.defineProperty(window, "__resolveGameExit", {
    configurable: true,
    get() { return resolveGameExit; },
    set(callback) {
      resolveGameExit = typeof callback !== "function" ? callback : (result) => {
        if (result?.reason === "leave" || result?.reason === "native_exit") {
          location.replace(returnUrl);
          return;
        }
        return callback(result);
      };
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target instanceof Element &&
        event.target.closest("#loading-cancel, #loading-error-leave")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      location.replace(returnUrl);
    }
  }, true);
})();
