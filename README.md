# 🕹️ Daniel's Arcade

One place for all of Daniel's games — **Monster Attack!**, **REBUILD**, **Buckshot Roulette**,
**Track Run** and **Learn English** — with play-time coins, a shop, skins, abilities, codes,
quests and accounts.

## Open it

Double-click **`Open Arcade.command`** — or go to **http://localhost:4173/games/arcade/**.

The arcade runs through **Nullp** (the `Nullp-AI` folder next to this one). Nullp starts by
itself when you log in to the Mac, so the link just works. Opening `index.html` as a plain file
also works, but then Nullp, accounts and some saving features are off.

## Coins 🪙

- **1 play coin for every 10 minutes** of play inside the arcade.
- Time only counts while a game is open, the window is in front, and you aren't idle
  (5 minutes with no input pauses it).
- Up to **24 play-time coins a day**. Codes give coins too. The wallet has no limit.

## 🛒 Shop

| Tab | What's in it |
|---|---|
| Themes, Avatars, Titles | how the arcade looks, and your name badge |
| ⚡ Abilities | small boosts for each game, levels 1–5 — switch up to **3 on per game** in the ⚡ bar on the left of a game |
| Gun / Ability Skins, Backgrounds | 20 each; they show up in Monster Attack!, Buckshot and REBUILD (gun skins colour the gun itself) |
| Game money (inside a game) | trade coins for 🍖 flesh, 🔷 Core Shards, 🎁 bonus items or ❤️ extra lives — up to **20 coins a day per game** |
| 🎁 Codes (arcade only) | 30 codes; finding all of them unlocks the 🕵️ Secret Agent pack |

## 🏅 Special titles

| Title | How to get it |
|---|---|
| 🏆 Champion | win Buckshot 10 times in a row, then wear the **Shadow** gun skin |
| ⚡ Fast Comebacker | win a REBUILD battle after your base dropped to **1 HP** |
| ⚔️ Revenge | die to the ☠️ **Reaper** in Monster Attack!, then beat it in your **very next** match |

## 🔐 Quests → 🛠️ Admin Panel

The quests are hidden: open **Shop → 🎁 Codes** and click the invisible **bottom-left corner**.

1. **Hard Quest** — play time, codes, abilities, shopping and reporting a 🐞 bug.
2. **Medium Quests** — first find the hidden secret near spawn in Monster Attack!'s 🔮
   **Astral Temple**. Reward: 15 coins, 🔮 Astral Seeker and 🔮 Astral Oracle.
3. **Easy Quest** — unlock the three special titles above.
4. **🛠️ Admin Panel** — coins, items, abilities, Free Shop, Super Mode, Infinite Coins, codes,
   bug reports. Owners can skip the quests.

## 👤 Accounts

**Log in** in the top bar. While logged in, everything — arcade progress and the games' progress —
saves to your account automatically. Accounts live on this Mac in `~/.daniels-arcade/`
(never on GitHub). Don't reuse a password from another website.

## 🐞 Bugs

**🐞 Bug** in the top bar sends a report. Crashes inside a game are caught automatically. Reports
show up in the Admin Panel.

## For developers

- `index.html` — the arcade page. `arcade-shop.js` — the shared shop; Monster Attack!,
  Buckshot and REBUILD each carry a **copy**. After editing it run:
  `cp arcade-shop.js ../monster-city/ && cp arcade-shop.js ../shooting-game/public/ && cp arcade-shop.js ../rebuild/`
- Tests: `node tools/test-arcade.js` in `rebuild/` and `shooting-game/`, and the `tools/*.js`
  tests in `monster-city/`.
- Accounts: `Nullp-AI/arcade-accounts.js`. Nullp auto-start: `~/Library/LaunchAgents/com.daniel.nullp.plist`.
