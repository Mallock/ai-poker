# Kenney Boardgame Pack assets

This folder is for [Kenney's Boardgame Pack](https://kenney.nl/assets/boardgame-pack) (CC0 license).

## How to install

1. Download the **Boardgame Pack** ZIP from https://kenney.nl/assets/boardgame-pack
2. Unzip it.
3. Copy the playing-card PNGs into this folder under `cards/` so the final paths look like:

```
public/assets/kenney/cards/AS.png   ← Ace of Spades
public/assets/kenney/cards/KH.png   ← King of Hearts
public/assets/kenney/cards/2C.png   ← Two of Clubs
public/assets/kenney/cards/back.png ← Card back
```

4. Copy the chip PNGs into `chips/`:

```
public/assets/kenney/chips/chip_white.png
public/assets/kenney/chips/chip_red.png
public/assets/kenney/chips/chip_blue.png
public/assets/kenney/chips/chip_green.png
public/assets/kenney/chips/chip_black.png
```

The Kenney pack uses different filenames out of the box — you can either rename them as above, or edit [`src/components/Card.vue`](../../../src/components/Card.vue) and [`src/components/Chip.vue`](../../../src/components/Chip.vue) to point at the names you have. The app falls back to an inline SVG placeholder for any missing file, so partial installs work.

## Why this isn't checked in

To keep this repo small and to respect upstream distribution preferences, the Kenney assets are gitignored. CC0 means you *can* redistribute them; we just choose not to.
