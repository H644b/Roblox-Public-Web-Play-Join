# Roblox browser-play extension (experimental)

This unpacked Brave/Chrome extension adds a globe button beside the normal Play button on `www.roblox.com/games/...` detail pages. The globe opens `play.roblox.com/games/start?placeId=...` **in the same tab**. The Web Play page automatically changes its initial and teleport game-join XHRs' `rbx-user-agent` to `Roblox/Darwin` and supplies a browser WebTransport hostname in an approved join response when Roblox omits it. Choosing **Leave** from the in-game Escape menu returns to that game's detail page.

Version 0.3 also patches the Web Client's `/v1/join-game-instance`, `/v1/join-reserved-game`, and `/v1/join-private-game` requests, which can occur during teleports. It does not request the Chrome `debugger` permission or attach a debugger, so the extension itself does not trigger Chrome's debugging banner. The previous, live-tested debugger version is preserved in `../Roblox-Public-Web-Play-Join-Debugger-0.1.0.zip`.

Live Brave verification on November 1, 2026: the globe button appeared on the detail pages for `[GUILDS] Build a Dungeon` (`119238997901301`) and `Natural Disaster Survival` (`189707`). Both opened in the same tab and reached playable multiplayer worlds. In Build a Dungeon, Escape → Leave returned to its detail page, where the globe button was present again. Other experiences and server layouts remain unverified.

Blade Ball (`13772394625`) exposed the teleport gap in version 0.2: its initial join succeeded, then its automatic reserved-server join still sent `Roblox/Web` to `/v1/join-reserved-game` and received internal status `12` with a Playtesters Only message. After reloading version 0.3 in Brave, the same automatic transfer reached the arena with the avatar, other players, and Block/Ability controls visible; the previous error 773 popup did not appear during the observation.

## Install and use

1. Open `brave://extensions` or `chrome://extensions`, enable Developer mode, and load this folder with **Load unpacked**. If a previous version is already installed from this folder, click its **Reload** button.
2. Open any Roblox game detail page at `https://www.roblox.com/games/<placeId>/...`.
3. Click the globe button next to Roblox's Play button. The player opens in the same tab and the join patch runs automatically.
4. Open the Roblox menu with Escape and choose **Leave** to return to that game's page.

The extension's content scripts run only on Roblox game detail pages and Web Play start pages. It does not use `chrome.debugger`, store join tickets, or send data to another service. Roblox may change its Web Client, DOM, launcher rules, or WebTransport address layout; other server layouts are not guaranteed to work. The [research report](../README.md) describes how the `.33` to `.34` address mapping was established.
