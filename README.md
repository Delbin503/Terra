# Terra — Web

Frontend for Terra, the AI world & synthetic-dataset generation platform.

- **Vite + React + TypeScript**
- **Tailwind CSS** with a CSS-variable design system (see [`DESIGN.md`](./DESIGN.md))
- **Radix UI** primitives · **Lucide** icons · **class-variance-authority**

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173  (Terra platform home page)
npm run editor   # opens the browser straight to the 3D HDRI editor
```

```bash
npm run build    # typecheck + production bundle
npm run preview  # preview the build
```

### Routes

The app uses a minimal hash router (`src/App.tsx`):

| URL | View |
| --- | --- |
| `http://localhost:5173/` | Terra platform home page |
| `http://localhost:5173/#editor` | **3D HDRI editor** (Three.js viewport) |
| `http://localhost:5173/_sb-preview.html` | **Design system reference** (static; tokens, type, components) |

`npm run editor` is just `vite --open /#editor` — a shortcut so you don't land
on the home page when you want the editor.

## HDRI asset

The editor lights the scene with a 79 MB HDRI environment map that is **not
committed** to the repo (`public/hdri/` is gitignored to keep the repo light).
After cloning, place the `.exr` here so the viewport isn't black:

```
public/hdri/aarfontein_dusk_4k.exr
```

Any equirectangular `.exr`/`.hdr` works — update the path in
`src/features/editor/SceneCanvas.tsx` (`<Environment files=… />`) if you use a
different file. The 3D model at `public/models/robotic-hand.glb` **is** committed.

## Structure

```
src/
  styles/       tokens.css (design tokens) + globals.css
  lib/          utils (cn)
  components/
    icons/      semantic Lucide registry + <Icon>
    ui/         Button, IconButton, Badge, Card, Avatar, Meter, Tooltip, Dialog
  features/
    home/       Sidebar, ChatLauncher, CreateWorldModal, ProjectCard, HomePage, data
  App.tsx
  main.tsx
```

## Home page

- Collapsible left sidebar — brand, Create, nav, Starred, and (migrated from the
  old top bar) credit meters + user + downloads + notifications.
- Centered greeting + chat launcher (⌘K) that opens the **Start a new world**
  modal with **2D input** / **3D input (Beta)** paths.
- Projects row → View all → What's new / Community → community worlds.
