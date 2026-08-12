# Fuse

An encrypted environment variable manager for macOS and Windows, with a command line tool that pulls
and pushes env files straight from any project folder.

Workspaces keep different companies apart. Inside a workspace you have projects, inside projects you
have folders for each environment, and inside folders you have env files holding the variables
themselves. Everything lives in one file on disk, encrypted with AES-256-GCM behind a master
password.

## What is in the box

- **Workspaces** so client work never mixes with your own
- **Nested folders and env files** under each project
- **Twenty variable types** with validation, secret masking and inline editing
- **Fifteen formats** for import and export: `.env`, JSON, YAML, TOML, shell, Java properties,
  xcconfig, INI, CSV, Docker env-file, Kubernetes ConfigMap and Secret, GitHub Actions, Netlify and
  Dart defines
- **Full change history** with value diffs and one click restore, including undoing a whole deleted
  folder
- **Zip import and export** of part or all of the vault, optionally encrypted with its own password
- **A lock screen** with auto-lock on idle, sleep, blur or minimise, plus clipboard auto-clear
- **`fuse`**, the command line companion, for macOS and Windows

## Running it

```bash
yarn install
yarn dev
```

The first launch asks you to create a master password. There is no way to recover it, so keep it
somewhere safe.

## Building

```bash
yarn icons        # regenerate build/icon.{png,icns,ico} from build/logo-source.png
yarn build:mac    # dmg and zip
yarn build:win    # nsis installer, portable and zip
yarn build:all    # both
```

`yarn build` also bundles the CLI into `dist-cli/` so the app can install it for you.

## Where things live

| Platform | Vault folder                         |
| -------- | ------------------------------------ |
| macOS    | `~/Library/Application Support/Fuse` |
| Windows  | `%APPDATA%\Fuse`                     |
| Linux    | `~/.config/Fuse`                     |

Set `FUSE_HOME` to point both the app and the CLI somewhere else.

| File             | What it holds                                                                  |
| ---------------- | ------------------------------------------------------------------------------ |
| `vault.fuse`     | The whole vault, encrypted                                                     |
| `vault.fuse.bak` | The previous version, kept on every write                                      |
| `device.key`     | The data key sealed by the system keychain, only if you asked to be remembered |
| `bridge.json`    | Loopback port and token, written while the app is open                         |
| `session.json`   | The CLI's cached session                                                       |

## Security

The master password is stretched with scrypt into a key encryption key, which wraps a random data
key. The data key encrypts the vault body with AES-256-GCM. The password itself is never written to
disk.

If you ask Fuse to remember the device, the data key is stored through the system keychain, which is
Keychain on macOS and DPAPI on Windows, so the app and the CLI can open the vault without typing.
Forget the device from Settings and the password is required again.

While the app is open it runs a small server bound to `127.0.0.1` so the CLI can use the unlocked
session. Requests need a bearer token from `bridge.json`, which is written with `0600` permissions,
and requests carrying an `Origin` header are refused so a web page cannot reach it. Turn the bridge
off in Settings and the CLI opens the vault itself instead.

## The command line tool

Install it from the app's **Command line** page, which writes a small launcher into `/usr/local/bin`
on macOS or a `fuse.cmd` under `%LOCALAPPDATA%\Fuse\bin` on Windows. It uses the copy of Node inside
the app, so nothing else is needed.

```bash
cd ~/code/my-new-service
fuse pull                  # pick a file in the vault and write it here
fuse push .env             # send this folder's file back into the vault
fuse link                  # tie this folder to that file, then pull stops asking
fuse run -- npm start      # run a command with the variables injected
fuse diff dev prod         # compare two environments
fuse --help                # every command
```

It is also published on its own from
[`fuse-env-manager-cli`](../fuse-env-manager-cli), for machines that do not have the app installed.

## Layout

```
electron/     main process: vault store, crypto, history, zip, CLI bridge, IPC
shared/       domain model, env format codecs, vault encryption, tree helpers
src/          React renderer: side navigation, vault browser, dialogs, pages
cli/          the fuse command, bundled into the app and synced to its own package
scripts/      build, icon generation and CLI sync
build/        icon sources and generated icons
```

`yarn sync:cli` copies `cli/src` and `shared` into the sibling `fuse-env-manager-cli` repository so
the published package and the bundled one never drift apart.

## Languages

English is the only dictionary shipped today. `src/i18n` holds the provider, the dictionary and the
language registry, and `tailwindcss-rtl` is already wired up, so adding a language means adding a
dictionary and an entry in `LANGUAGES`.

## Commands

| Command          | What it does                                     |
| ---------------- | ------------------------------------------------ |
| `yarn dev`       | Vite and Electron together with hot reload       |
| `yarn typecheck` | Type check every workspace                       |
| `yarn lint`      | ESLint                                           |
| `yarn format`    | Prettier                                         |
| `yarn icons`     | Rebuild the app icons                            |
| `yarn build:cli` | Bundle the CLI into `dist-cli/`                  |
| `yarn sync:cli`  | Copy the CLI sources into the standalone package |
