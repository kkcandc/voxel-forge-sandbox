# Voxel Forge

A luminous block world that runs in the browser. The land is grown from a seed: shores, groves, highlands, caves, and a sun that actually sets. Break blocks, place them, and share the same horizon with a link.

This is an original sandbox. It is not affiliated with any studio, and it does not reuse another game's name, textures, or characters.

## Play

Open the site, wait for the horizon to finish forming, then choose **Step in**.

| Action | Control |
| --- | --- |
| Look | Click the view, then move the mouse |
| Move | W A S D |
| Jump | Space |
| Sprint | Shift |
| Fly | F, or double-tap Space. Shift descends. |
| Break | Left click, or hold to keep mining |
| Place | Right click |
| Choose a block | 1–9 and 0, the scroll wheel, or the hotbar |
| Roll the sun | `[` and `]` |
| Noon / golden hour | N / M |
| Pause the sun | P |
| Return to your landing | R |

On a phone, drag the left pad to walk, the right pad to look, and use the buttons along the bottom.

Your edits are kept in this browser for that seed. The land itself is fully determined by the seed, so the same link grows the same coast on any machine.

## Seeds

Any word works.

- `?seed=amber-grove`
- `?seed=quiet-tide`
- `?seed=lumen-field`

Add `&t=0.48` to open at noon, or `&t=0.2` for night. `t` runs from 0 at midnight through 0.5 at noon to 1.

## Develop

```bash
npm install
npm run dev
```

The dev server listens on port 5173. `npm run build` typechecks and writes a static site to `dist/`.

## Deploy

The app is a static Vite build. Vercel detects that from `vercel.json` (`framework: vite`, output `dist`). No server, no keys, no paid APIs.
