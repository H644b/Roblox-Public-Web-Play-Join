import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const code = readFileSync(new URL("./page-hook.js", import.meta.url), "utf8");
const nativeResponse = {
  status: 2,
  joinScript: {
    NetStackTokenValue: "AAECAwQFBgcICQoLDA0ODw==",
    MachineAddress: "10.41.5.30",
    NetStackPort: 50988,
    UdmuxEndpoints: [{ Address: "128.116.56.33" }],
    gameFqdn: null
  }
};

function makeXhr() {
  return class FakeXhr {
    constructor() {
      this.headers = [];
      this.readyState = 4;
      this.status = 200;
      this._response = new TextEncoder().encode(JSON.stringify(nativeResponse)).buffer;
    }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.headers.push([name, value]); }
    send() { this.sent = true; }
    get response() { return this._response; }
  };
}

function makePage() {
  const workerScripts = [];
  const navigations = [];
  const BaseUrl = URL;
  class TestUrl extends BaseUrl {
    static createObjectURL(blob) {
      workerScripts.push(blob.parts.join(""));
      return `blob:https://play.roblox.com/${workerScripts.length}`;
    }
    static revokeObjectURL() {}
  }
  class Blob {
    constructor(parts) { this.parts = parts; }
  }
  class Worker {
    constructor(url, options) { this.url = url; this.options = options; }
  }
  const location = {
    origin: "https://play.roblox.com",
    pathname: "/games/start",
    search: "?placeId=119238997901301&returnUrl=https%3A%2F%2Fwww.roblox.com%2Fgames%2F119238997901301%2FBuild-a-Dungeon",
    href: "https://play.roblox.com/games/start?placeId=119238997901301",
    replace: (url) => navigations.push(url)
  };
  const context = {
    URL: TestUrl,
    URLSearchParams,
    Blob,
    Worker,
    XMLHttpRequest: makeXhr(),
    ArrayBuffer,
    TextEncoder,
    TextDecoder,
    atob,
    location,
    document: { addEventListener() {} },
    addEventListener() {},
    window: null
  };
  context.window = context;
  runInNewContext(code, context);
  return { context, workerScripts, navigations };
}

function assertPatchedXhr(Xhr, path = "/v1/join-game") {
  const request = new Xhr();
  request.open("POST", `https://gamejoin.roblox.com${path}`);
  request.setRequestHeader("rbx-user-agent", "Roblox/Web Mac");
  request.send();
  assert.deepEqual(request.headers, [["rbx-user-agent", "Roblox/Darwin"]]);
  const body = JSON.parse(new TextDecoder().decode(request.response));
  assert.match(body.joinScript.gameFqdn, /\.80743822\.qdmux\.roblox\.com$/);
  assert.equal(body.joinScript.NetStackTokenValue, nativeResponse.joinScript.NetStackTokenValue);
}

test("main and Web Client worker XHRs use native identity and browser route", () => {
  const { context, workerScripts } = makePage();
  assertPatchedXhr(context.XMLHttpRequest);

  const source = "https://setup.rbxcdn.com/webclient/version-test/WebClient.js";
  const stub = `https://play.roblox.com/assets/webclient/stub.js?src=${encodeURIComponent(source)}`;
  const worker = new context.Worker(stub, { name: "em-pthread" });
  assert.match(worker.url, /^blob:/);
  assert.equal(workerScripts.length, 1);

  const workerContext = {
    URL,
    XMLHttpRequest: makeXhr(),
    ArrayBuffer,
    TextEncoder,
    TextDecoder,
    atob,
    location: { href: worker.url },
    importScripts: (url) => assert.equal(url, source),
    self: null
  };
  workerContext.self = workerContext;
  runInNewContext(workerScripts[0], workerContext);
  assertPatchedXhr(workerContext.XMLHttpRequest);
  assertPatchedXhr(workerContext.XMLHttpRequest, "/v1/join-reserved-game");
});

test("teleport joins use native identity and browser route", () => {
  const { context } = makePage();
  for (const path of [
    "/v1/join-game-instance",
    "/v1/join-reserved-game",
    "/v1/join-private-game"
  ]) {
    assertPatchedXhr(context.XMLHttpRequest, path);
  }
});

test("the player leave callback returns to the matching game page", () => {
  const { context, navigations } = makePage();
  const otherExits = [];
  context.window.__resolveGameExit = (result) => otherExits.push(result.reason);
  context.window.__resolveGameExit({ reason: "join_failed" });
  context.window.__resolveGameExit({ reason: "leave" });
  assert.deepEqual(otherExits, ["join_failed"]);
  assert.deepEqual(navigations, [
    "https://www.roblox.com/games/119238997901301/Build-a-Dungeon"
  ]);
});

test("unrelated requests and workers keep their original behavior", () => {
  const { context, workerScripts } = makePage();
  const request = new context.XMLHttpRequest();
  request.open("POST", "https://example.com/v1/join-game");
  request.setRequestHeader("rbx-user-agent", "Roblox/Web Mac");
  request.send();
  assert.deepEqual(request.headers, [["rbx-user-agent", "Roblox/Web Mac"]]);
  assert.equal(new context.Worker("https://play.roblox.com/other.js").url,
    "https://play.roblox.com/other.js");
  assert.equal(workerScripts.length, 0);
});
