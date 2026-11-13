# Vault Graph

A local web app that shows Markdown indexes and the links between documents as a 3D voxel graph. It ships with a 5,000-document demo and supports search, document selection and toggling labels.

## Install and run

Requires Node.js 22.12 or later.

```bash
git clone https://github.com/HOYUN-Y/vault-graph.git
cd vault-graph
npm ci
npm run build
npm run preview
```

Open http://127.0.0.1:5181 in your browser. For development mode, run `npm run dev`.

## Connecting a real vault

The demo works with no settings. To connect a real vault, copy `settings.example.json` to `settings.json` and set `vaultPath` to the vault's absolute path. Source files are read-only.

`structure` selects how the vault is read:

- `"indexed"` (default): the router is `CLAUDE.md`, and every index starts expanded.
- `"workspace"`: set `routerPath` to the router's path relative to the vault. Only area indexes start expanded; other indexes appear as clusters labelled with their child count, and you click a cluster to expand it.

### Private rules

- Backticked names on a router line marked "Private" (or the Korean `비공개`) are hidden, along with everything under them.
- A router line `Private ledger: .secondbrain/private-paths.txt` adds the vault-relative paths listed in that file, one per line (`#` starts a comment). The line must appear exactly once and point to that exact path.
- If the rules cannot be read or parsed, no real data is shown and the app shows the demo instead.

## Labels and fonts

Turn labels on and off with the **Labels** button or the **L** key. Font licenses are in `public/fonts/licenses/`.
