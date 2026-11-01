# Roblox Web Play native join header test

This unpacked Brave/Chrome extension changes **only** the `rbx-user-agent` header on `POST https://gamejoin.roblox.com/v1/join-game` requests from a selected `play.roblox.com` tab. It sets the header to `Roblox/Darwin`. The rule is scoped to the tab, is enabled by a click, and is removed when disabled or when the browser session ends.

## Use

1. Open `brave://extensions`, enable Developer mode, then choose **Load unpacked** and select this folder.
2. Open `https://play.roblox.com/games/start?placeId=119238997901301` in Brave.
3. Click the extension icon and choose **Enable for this tab and reload**. The page reloads with the join header rule active.
4. To remove the rule, click the extension icon again and choose **Disable for this tab and reload**. Unloading the extension also removes its rules.

## What to expect

In a live request test, this header changed the public place's launcher response from internal status `12` (Playtesters Only) to status `2` (join approved). It did **not** make public Web Play playable. The approved native response lacked the `gameFqdn` WebTransport hostname that Web Play needs, and a derived public route failed its WebTransport handshake. The game may still show an error after the first join step. See the [research report](../README.md) for the observations and controls.

On an owned-game control, the original `Roblox/Web` identity returned an approved response with `gameFqdn`; the same request with `Roblox/Darwin` returned approval without `gameFqdn`. That is why this extension should be used only as a launcher-gate test.

A same-server check confirmed the limit: an owned server's Web Play route passed a direct WebTransport handshake, while a native-identity join to that exact server was approved but its derived browser route failed the handshake.

The extension does not alter Roblox account cookies, change the standard `User-Agent`, intercept responses, or modify the desktop client. It applies to a join request from the tab where it was enabled, including a different game opened later in that same tab. Disable it before using that tab to join an owned game through Web Play.
