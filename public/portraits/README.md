# AI character portraits

Drop one PNG per character here, named with the character's `id` field from [`src/ai/characters.js`](../../src/ai/characters.js):

```
public/portraits/the-cowboy.png
public/portraits/the-femme-fatale.png
public/portraits/the-high-roller.png
...
```

Recommended size: 512×512, square. They are rendered into circular masks in the seat UI.

If a portrait file is missing, the seat shows an initials-on-color placeholder so gameplay is not blocked.
