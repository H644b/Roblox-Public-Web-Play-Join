# Native transport and alternate Web Play join checks

Observed November 1, 2026. The installed `RobloxPlayer` binary was SHA-256 `e71efaf43d6c92f57187177eddc4d1491eb0615ed42fd33a548f8fcb7bf8bc5c` at `/Applications/Roblox.app/Contents/MacOS/RobloxPlayer`.

## Native transport selection

The original client log at `~/Library/Logs/Roblox/0.744.0.7441080_20261101T015941Z_Player_1c458_last.log` had SHA-256 `4a7d79dc5c5f19b7e6bcee3f466f6300c59cfe20a9ec9d9de09b4d68515d40cd` when read; the live client may append to that file afterward. It was read in place; join tickets and full request bodies were not copied here.

- `2026-11-01T02:12:41.511Z`: `GameJoinUtil::joinGamePostStandard` sent a `/v1/join-game` body with `placeId=119238997901301`.
- `2026-11-01T02:12:41.857Z`: `NetworkClient` logged `useRbxTransportEnabled=false, selectedTransport=RakNet` for the following connection.

The client also logged an RNA probe connection. The explicit `NetworkClient` selection above is the evidence for the actual game transport in this join; the probe does not establish that WebTransport was used for gameplay.

The captured WebClientApp settings include `FFlagUseRbxTransportClient3="True"` and `FFlagUseRbxTransportClient3_PlaceFilter="False;6100476748;6082946906"`. These are web settings and do not by themselves establish which flags the native client used, but they show that transport selection is gated separately from the global enable flag.

## Web hostname generation flag

The native binary and `WebClient.wasm` contain `DebugRbxTransportGenerateGameFqdn`. Focused ARM64 disassembly is in [`GameFqdn-generation.disasm`](GameFqdn-generation.disasm) and [`GameFqdn-helpers.disasm`](GameFqdn-helpers.disasm). The routine near `0x1022fb9e0` tests the generation flag and an address-validity field before formatting a hostname. This is static code evidence, not proof that it can generate a usable public server route.

In a temporary Brave tab, I patched the live `WasmPlayer.js` response at its one `set_preloaded_flags(JSON.stringify(s))` call to set `DFFlagDebugRbxTransportGenerateGameFqdn="True"`. A console marker confirmed `generation=True count=22939`, preserving the complete fetched settings and adding one override. I separately changed only the `/v1/join-game` request's `rbx-user-agent` to `Roblox/Darwin`. The launcher returned internal status `2`, but `joinScript.gameFqdn` was still `null`, and the browser ended with the same uncaught `WebAssembly.Exception` before gameplay. The flag alone therefore did not solve this public join.

A preliminary test that replaced the 22,938 server flags with only 267 transport-related entries ended at error 256; it is not a valid control for the full-settings result because many settings were omitted. An attempted compressed full response was delivered to the page as compressed bytes and rejected as JSON, so it also supplies no join evidence.

## Owned-game response control

I joined the user's owned `placeId=13559575191` in the same temporary Brave tab and intercepted only its `/v1/join-game` POST. With its original `Roblox/Web ...` identity, the first response was a retry state (`status=0`); the next response was `status=2` and included a nonempty `joinScript.gameFqdn`. After a reload, replacing only `rbx-user-agent` with `Roblox/Darwin` returned `status=2` immediately but `joinScript.gameFqdn` was `null`. The owned game therefore loses its browser hostname under the same native-identity patch even though admission succeeds. This directly separates launcher admission from browser route allocation without relying on the public game's permission state.

I also tried two `rbx-user-agent` header entries on one public request. Native then web returned `status=12` and no hostname. Web then native returned `status=2` and no hostname. The order dependence is consistent with one value winning during header normalization; these results did not produce both admission and a browser route. The exact value seen by each backend component was not captured.

The owned response's hostname also provided an exact format check. Its first label's three parts matched `NetStackTokenValue` as hexadecimal, `MachineAddress` encoded as eight hexadecimal digits, and `NetStackPort` encoded as four hexadecimal digits. The next label matched `UdmuxEndpoints[0].Address` encoded as eight hexadecimal digits. This supports the same choice of fields used for the earlier syntactically derived public hostname, while the failed public WebTransport handshake remains separate evidence about reachability.

### Same-server WebTransport control

I made a fresh ordinary Web Play join to the owned place. Its approved response included a `gameFqdn`, and a direct `WebTransport.ready` handshake to its `/wt` URL succeeded using that response's `NetStackConfig` certificate hash and capability query. I then POSTed to `/v1/join-game-instance` with `placeId=13559575191`, the **exact `GameId` from that Web Play response**, a new join-attempt ID, and `rbx-user-agent: Roblox/Darwin`. The native-identity request returned HTTP 200, internal status `2`, and the same `GameId`, but no `gameFqdn`.

I constructed a hostname from that native response's base64 network token, machine address, network port, and native UDMUX address. The encoding matched the format of the successful Web Play hostname, including its two hyphen separators. A direct browser handshake to that route failed with `WebTransportError: Opening handshake failed.` This control removed the different-server-instance explanation for the earlier owned-game comparison, but the native UDMUX address was still the wrong multiplexer for a browser connection, as the next check shows.

### Correct WebTransport multiplexer and playable public join

The same-server comparison above revealed a missing input: the Web Play and native responses agreed on the server machine address, network port, certificate hash, `NetStackConfig.port`, and capability string, but their UDMUX addresses differed. In one owned-server control, the native address was `128.116.30.33` and the Web Play address was `128.116.30.34`. Using the native-approved token with the **Web Play UDMUX address** produced a successful direct `WebTransport.ready` handshake; using the native UDMUX address failed. A fresh repeat confirmed the result with the same game instance, certificate, and transport port.

For public `placeId=119238997901301`, a native-identity join returned status `2` and native UDMUX address `128.116.56.33`. I derived the neighboring WebTransport address `128.116.56.34`, kept the public join's own token, server address, port, capability string, and certificate hash, and obtained a successful direct browser `WebTransport.ready` handshake.

I then repeated the public join through the live Web Client with a temporary, tab-scoped CDP patch: changed only the POST's `rbx-user-agent` to `Roblox/Darwin`, and added the derived `gameFqdn` to the approved response's `joinScript`. The client connected and rendered **[GUILDS] Build a Dungeon** in the browser, including its playable world, HUD, and player list. The page's own loading overlay was gone. The direct handshake and on-screen game are separate evidence; the latter verifies the full client path for this specific public place. The patch did not need to change `NetStackTokenValue`, `NetStackConfig`, `UdmuxEndpoints`, or the join ticket in the response.

The `.33` → `.34` UDMUX mapping was observed in two address groups. All temporary CDP interception patterns were cleared after the successful join. The [new unpacked extension](../../public-web-play-extension/README.md) packages these two request/response changes. It was installed in Brave with the user's approval and enabled on the public game tab. After reloading, its popup reported `Route supplied (128.116.56.33 → 128.116.56.34)`, and **[GUILDS] Build a Dungeon** again rendered a playable world. With the extension still enabled, navigating the same tab to public `placeId=189707` loaded **Natural Disaster Survival** into its multiplayer lobby and world. The tab was then returned to `119238997901301`, which loaded again. The second game's UDMUX address was not separately captured. Other public places and server layouts remain unverified.

## Alternate launcher API

The web binary contains `/v2/join-game` and `ReactiveJoinGameRolloutHundredthsPercentage`. The captured WebClientApp setting was `DFIntReactiveJoinGameRolloutHundredthsPercentage="100"`. I changed it to `"10000"` at the live `set_preloaded_flags` call and confirmed the value in a console marker; the Web Client still sent `/v1/join-game`. A separate, temporary rewrite of that v1 POST to `/v2/join-game`, retaining its v1 body and setting `rbx-user-agent: Roblox/Darwin`, received HTTP `404` with `{"errors":[{"code":0,"message":""}]}`. This rules out a simple URL substitution for this request. It does not establish what body or other gates a real v2 client would need.

## Transport-selection flag

The WebClientApp settings include `FFlagUseRbxTransportClient3="True"` and `FFlagUseRbxTransportClient3_PlaceFilter="False;6100476748;6082946906"`. I changed only the global client flag to `"False"` at the live `set_preloaded_flags` call, confirmed it with a console marker, and sent the public join POST with `rbx-user-agent: Roblox/Darwin`. The first launcher response was HTTP 200 with an empty body and the page retried. The second response was internal status `2` with no `gameFqdn`. Instead of the prior uncaught exception, the page ended with `Failed to start network client (Error Code: 256)`. This is a changed failure mode, not a working RakNet fallback; no game rendered.

`wasm-objdump -x research/WebClient.wasm` reported 274 imports, including Emscripten WebSocket functions, but no `__syscall_socket`, `__syscall_sendto`, or `__syscall_recvfrom` imports. The shipped JavaScript glue exposes WebTransport and generic WebSocket APIs. These static observations show no direct browser UDP binding for the native client's RakNet path. They do not rule out a more complex proxy or a different transport implementation.

All CDP request interception rules were cleared and cache settings restored after the checks. No installed Roblox or browser files were modified.
