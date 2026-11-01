# Roblox Web Play join investigation

Observed October 31–November 1, 2026, using the signed-in Brave browser and installed macOS Roblox client on this Mac. This is a snapshot of the creator beta, not a claim about future releases.

## Demo

[Watch the Blade Ball browser-play demo](demo/Roblox-Web-Play-extension-demo.mp4). The public clip is cropped to the game area, has no audio, and omits the player-list screen. It shows the globe button, Web Play launch, a live game lobby, and the return to the game page. The original screen recording is not included in this repository.

## How `play.roblox.com/games/start?placeId=...` works

1. The Next.js page reads `placeId`, looks up the universe and game name, checks for an authenticated Roblox session, and loads `WasmLoader.js`. See [`research/start.pretty.js`](research/start.pretty.js).
2. The loader resolves the `WebClientApp` channel and version from Roblox client settings, then loads the corresponding CDN `WasmPlayer.js`. See [`research/WasmLoader.js`](research/WasmLoader.js).
3. The player accepts a positive, safe-integer `placeId`, downloads and initializes `WebClient.wasm`, applies client flags and account locales, and calls `set_place_id(placeId)`. It also calls `set_pretend_platform("desktop")` on this Mac. See [`research/WasmPlayer.pretty.js`](research/WasmPlayer.pretty.js).
4. The engine handles the actual join. Its loading-status callback displays the resulting error code and message. The page's separate economy, universe, and thumbnail requests only fill in the loading screen.
5. `WebClient.js` supplies the engine's browser XHR and WebTransport bindings. The join endpoint and `GameJoinUtil` logging strings are embedded in `WebClient.wasm`; the JavaScript page does not construct the join POST itself.

The downloaded source snapshots are the unmodified `research/start.js`, `research/WasmLoader.js`, `research/WasmPlayer.js`, `research/WebClient.js`, and `research/WebClient.wasm`. The `.pretty.js` files only add formatting. The observed Web Client CDN directory was `version-75f1039cb4964863-RobloxWebClient`; the SHA-256 of `WasmPlayer.js` was `1a09831632d792d9862a44483b317b6d2cbf9b6bc94c103fedc85d3a49ab7965`, and the SHA-256 of `WebClient.wasm` was `d72c52618f5c153c9b17a97e644914d43918c7122d754d96f79e8323acc6a15d`.

## What I tested

| Launch | Result |
| --- | --- |
| `https://play.roblox.com/games/start?placeId=13559575191` | Gear Tester loaded into playable Web Play. |
| `https://play.roblox.com/games/start?placeId=119238997901301` | The page and engine loaded, identified **[GUILDS] Build a Dungeon**, then displayed **Not authorized to join this experience (Error Code: 524)**. The loading status identified its source as `gui-service`. |
| `;place me 119238997901301` in Gear Tester's HD Admin command input | No teleport was observed. `place` was absent from that game's command search, so this is not a valid test of `TeleportService` itself. |

I also inspected the page and player scripts for a URL-only route around the restriction. The join target passed into the engine is the `placeId` number. Other join parameters used by native deep links, such as `gameInstanceId` and `launchData`, are not forwarded by this Web Play bootstrap. Changing the visible loading screen or adding query parameters therefore would not provide Web Play permission for an unowned game.

## Desktop versus Web Play join

The installed native client is `MacPlayer` version `0.744.0.7441080`. Its log shows a successful join to `119238997901301`: `GameJoinUtil` POSTed to `https://gamejoin.roblox.com/v1/join-game` with `placeId`, `gameJoinAttemptId`, and a UDP probe report. The launcher returned internal status `2`, after which the client connected to the game server through RakNet/UDMUX. The game rendered in the native client. The original client log contains join tickets and is deliberately not copied into this workspace.

Web Play uses `WebClientApp` version `0.745.0.7451145`. A live browser request capture showed that it also POSTs to `/v1/join-game`, with `placeId` and `gameJoinAttemptId`. Its `rbx-user-agent` begins `Roblox/Web`; the request originates at `https://play.roblox.com`. For the same public place, the HTTP response was `200` but its **internal join status was `12`**, with message `You are not allowed to play this game. (Playtesters Only)`. This is the concrete response behind the displayed 524 error.

## Bypass experiments

I temporarily intercepted only the join request in Brave's DevTools protocol and changed the `rbx-user-agent` prefix from `Roblox/Web` to `Roblox/Darwin`. This changed the public game's launcher response from status `12` to **status `2`**, matching the desktop client's first join step. That header-only patch did **not** yield playable Web Play: the WebAssembly worker threw an uncaught exception before gameplay. The header-only patch also failed after admission on another public place, `189707` (Natural Disaster Survival).

A later check replaced the entire `rbx-user-agent` value with the fixed string `Roblox/Darwin`, keeping the other request headers and body unchanged. The launcher again returned status `2`, but its response still had no `gameFqdn`. The [unpacked Brave/Chrome extension](native-identity-extension/README.md) applies that fixed header value to one selected Web Play tab.

In a follow-up, the installed native client's log explicitly selected `RakNet` for the public game. Enabling the web binary's `DebugRbxTransportGenerateGameFqdn` flag while preserving all 22,938 server settings still produced a native-approved response without `gameFqdn` and the same WebAssembly exception. Forcing the captured reactive-join rollout setting did not switch Web Play to `/v2/join-game`; rewriting the v1 POST to that URL returned HTTP 404. The evidence and limits of these checks are in [`research/native/transport-followup.md`](research/native/transport-followup.md).

An owned-game control isolated the identity effect: with `Roblox/Web`, its approved response included `gameFqdn`; with `Roblox/Darwin`, its approved response had `gameFqdn: null`. Putting both identities into duplicate headers, in either order, also failed to obtain both public-game admission and a browser hostname. The native-header extension consequently cannot provide a playable public Web Play join by itself.

A stronger same-server control joined the exact owned server instance first through ordinary Web Play, then through `/v1/join-game-instance` with the native header. The Web Play response's route passed a direct WebTransport handshake. The native-identity response was also approved for that same `GameId`, but had no `gameFqdn`; a hostname derived using its native UDMUX address failed the handshake. This isolated the issue from server assignment and led to the address comparison below. See [`research/native/transport-followup.md`](research/native/transport-followup.md).

That failure was caused by using the native UDMUX address in the derived hostname. On the same owned server instance, native and Web Play responses shared the server address, transport port, certificate hash, and capabilities; the native UDMUX address ended in `.33` and the Web Play address ended in `.34`. The native-approved token completed a WebTransport handshake when its hostname used the Web Play `.34` address. The same neighboring-address mapping worked for a public native-approved join in another address group.

With a temporary CDP patch that changed the public join request to `rbx-user-agent: Roblox/Darwin` and added that derived `.34` `gameFqdn` to the response, **[GUILDS] Build a Dungeon rendered as a playable browser game**. The Web Client loaded its world, HUD, and player list. The original [debugger-based extension](Roblox-Public-Web-Play-Join-Debugger-0.1.0.zip) packaged both changes. After installation in Brave, that version independently loaded **[GUILDS] Build a Dungeon** and **Natural Disaster Survival** into their playable browser worlds. Its popup reported the supplied `.33` → `.34` route for the first game.

The [current extension](public-web-play-extension/README.md), also available as a [ZIP](Roblox-Public-Web-Play-Join-Experimental.zip), moves the join patch into the page and its Web Client worker, adds a browser-play button to Roblox game pages, and returns to the game page on Leave. Its local tests passed. After a Brave reload, both previously tested public games reached playable worlds through the globe button without the extension's debugger permission. Escape → Leave returned from Build a Dungeon to its detail page in the same tab.

Blade Ball (`13772394625`) exposed a separate teleport path. Its initial browser join reached the lobby, but the game automatically attempted `POST /v1/join-reserved-game` with the unchanged `Roblox/Web` identity. The launcher replied HTTP 200 with internal status `12` and `You are not allowed to play this game. (Playtesters Only)`; the client displayed teleport error 773. Version 0.3 of the extension applies the native identity and browser-route patch to the observed reserved-server join and the other v1 join variants used for teleports. After the extension was reloaded in Brave, Blade Ball's automatic transfer reached the arena with the avatar, other players, and Block/Ability controls visible. The earlier error popup did not recur during observation.

Forcing the Web Client's `FFlagUseRbxTransportClient3` setting off changed the public native-identity test from an uncaught exception to `Failed to start network client (Error Code: 256)`, without rendering the game. Its WebAssembly imports contain WebSocket bindings but no direct UDP socket imports, so the native client's observed RakNet path has no evident direct browser equivalent in this build.

The owned game's Web Play join response included a nonempty `gameFqdn` under `qdmux.roblox.com` and a 32-character hexadecimal network token. The spoofed public response had `gameFqdn: null` and a 24-character base64 network token. The hostname format was validated against an owned-game response: it encodes the token, internal server address, network port, and public multiplexer address. I tried adding a syntactically derived hostname to the public response, then also converting its token to the Web Play hex representation. Both response patches still ended in the same WebAssembly exception. A no-op response rewrite on the owned game remained playable, so response interception itself was not the cause of that failure.

Controls narrowed the failure. Removing only `gameFqdn` from a successful owned-game response reproduced the same exception. Changing one character in a valid owned-game hostname also reproduced it, while converting only the owned token from hexadecimal to base64 still let the game load. Both owned and public `NetStackConfig` values decoded to the same field structure (`pubKey`, `port`, `caps`, `certHashes`) and the same capability bit string. Changing the conventional HTTP `User-Agent` to a native-looking value while leaving `rbx-user-agent` as `Roblox/Web` still returned status `12`; a hybrid `Roblox/Darwin Web` identity returned status `2` without a `gameFqdn`.

The WebAssembly binary contains explicit diagnostics for a missing WebTransport `gameFqdn`. Disassembly of its connection routine showed that the browser connects to `https://<gameFqdn>:<NetStackConfig.port>/wt` with `X-Rbx-Capabilities=<NetStackConfig.caps>` and, when its enabled flag applies, `X-Rbx-Close-Reason=utf8-v1` in the query string. The relevant code is preserved in [`research/wasm/WebTransport-functions.disasm`](research/wasm/WebTransport-functions.disasm) and [`research/wasm/WebTransport-helpers.disasm`](research/wasm/WebTransport-helpers.disasm). The capability query name was recovered from the binary's initialized data segment. No join ticket, network token, or complete server hostname is stored in those excerpts.

Using that complete URL and the server certificate hash from a fresh owned-game response, a direct browser `WebTransport.ready` check **succeeded**, and the owned game loaded after its join response was released. The same URL construction with a fresh native-approved public response and a hostname derived using its native UDMUX endpoint failed with `WebTransportError: Opening handshake failed.` Earlier probes that omitted the `/wt` path and query also failed for the owned game, so they were inconclusive. Later same-server controls showed that WebTransport required the neighboring `.34` UDMUX address rather than the native `.33` address.

I also retried the public route without the optional `X-Rbx-Close-Reason` query parameter; the handshake still failed. The signed native client's captured join log shows its public session proceeded using its native transport, while the browser has only the WebTransport binding for this path.

Rewriting the web request to `/v1/join-game-instance` for an existing public server also returned status `12` and the same Playtesters Only message. All DevTools interception rules were cleared after each test. No modified browser or Roblox installation was left behind.

I tested whether launcher admission could be handed back to the browser identity. A fresh public `/v1/join-game` request was approved as `Roblox/Darwin` (status `2`). I then repeated the same place ID and `gameJoinAttemptId` from the same signed-in browser session using the original `Roblox/Web` identity. The second response independently returned status `12`, Playtesters Only, with no `gameFqdn`; it did not reuse the earlier admission. This rules out simple identity switching between two join requests as a way to obtain a WebTransport route.

## Result

**Playable Web Play joins were achieved for public places `119238997901301` and `189707` with the installed extension.** The request used the native identity to pass the launcher gate. The approved response then received a hostname built from its own network fields and the neighboring WebTransport UDMUX address. Both live pages rendered their game worlds and multiplayer UI. Other public places and server layouts remain unverified.

An offline disassembly of the signed native executable was attempted through REA/Hopper. Initial bridge startup timed out while Hopper analyzed the large binary; the resulting 583 MB [`research/native/RobloxPlayer.hop`](research/native/RobloxPlayer.hop) database was saved for later focused analysis. No function-level decompilation result was used for the conclusions above.

Roblox's [creator beta announcement](https://devforum.roblox.com/t/creators-can-test-games-on-the-web/4964592) says individually owned games can be tested by their owner and explicitly lists cross-universe teleporting into games you do not own or have playtester permission for as a known issue. Its [Error 524 help page](https://en.help.roblox.com/hc/en-us/articles/41933144508180-Error-Code-524-You-do-not-have-permission-to-join-this-game) describes 524 as a join-permission error. The supported current route to this public place is the installed native client, for example the documented [`www.roblox.com/games/start` deep link](https://create.roblox.com/docs/production/promotion/deeplinks):

`https://www.roblox.com/games/start?placeId=119238997901301`

That URL launches the native app; it does not make the place playable in Roblox Web Play.
