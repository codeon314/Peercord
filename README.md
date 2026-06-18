<div align="center">
  <!-- PLACEHOLDER: Add your logo image here -->
  <img src="https://git.churchofmalware.org/mastercodeon/Peercord/raw/branch/main/Assets/icon.png" alt="Peercord Logo" width="128" height="128" />

  # Peercord
  
  **A fully decentralized, peer-to-peer Discord clone powered by Pear Runtime and Hyperswarm.**

  [![License: GPL-3.0](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
</div>

Peercord is a serverless communication platform that offers text, voice, video, and screen sharing capabilities without relying on centralized infrastructure. It uses a distributed hash table (DHT) to discover peers and append-only cryptographic logs (Hypercores) to sync messages and files.

This repository contains both the **Peercord Client Application** (Electron + React + Pear Runtime) and the **Peercord Desktop Installer** (C# Avalonia).

---

## 📥 Downloads

| Platform | Architecture | Download Link |
| :--- | :--- | :--- |
| **Windows** | x64 | [Download Installer (.exe)](https://storage.peercord.chat/Peercord%20Release/Installers/WIN_x64/PeercordInstaller.exe) <!-- PLACEHOLDER: Add Windows x64 link --> |
| **Linux** | x64 | [Download Installer (Binary)](https://storage.peercord.chat/Peercord%20Release/Installers/LINUX_x64/PeercordInstaller) <!-- PLACEHOLDER: Add Linux x64 link --> |
| **Windows** | ARM64 | *Coming Soon* |
| **Linux** | ARM64 | *Coming Soon* |
| **macOS** | Apple Silicon / Intel | *Coming Soon* |
| **Android** | ARM64 | *Coming Soon* |

---

## 📸 Screenshots

<div align="center">
  <img src="https://git.churchofmalware.org/mastercodeon/Peercord/raw/branch/main/Screenshots/Peercord.png" alt="Peercord App" width="800"/>
  <br/>
  <em>Peercord Main Interface</em>
</div>

<br/>

<div align="center">
  <img src="https://git.churchofmalware.org/mastercodeon/Peercord/raw/branch/main/Screenshots/Installer.png" alt="Peercord Installer" width="600"/>
  <br/>
  <em>Peercord C# Avalonia Installer</em>
</div>

---

## ✨ Features

Peercord is packed with features designed to replicate a modern chat application experience, entirely peer-to-peer.

### 🔒 Privacy & Security
* **100% Decentralized**: No central servers. Your data lives on your machine and syncs directly with your peers.
* **Decentralized Identity**: Accounts are generated locally using Ed25519 cryptographic keypairs derived from a 64-character hex seed.
* **End-to-End Encryption (E2EE)**: Direct messages and files are encrypted using `xchacha20poly1305_ietf` via `sodium-native`.
* **Live Decryption Animation**: A cinematic, real-time visual effect that shows encrypted messages decoding on your screen.
* **Developer Crypto Mode**: A toggleable UI mode that lets you inspect the raw cryptographic nonces and ciphers of your E2EE messages to verify security.

### 💬 Communication
* **Hubs (Servers)**: Create public or private decentralized servers with multiple text and voice channels.
* **Group Whispers**: Create private, invite-only group chats with up to 50 members.
* **1-on-1 Whispers**: Direct messaging with real-time presence.
* **Rich Text Formatting**: Full Markdown support, including code blocks with syntax highlighting.
* **Real-Time Indicators**: See when users are typing, and track message status with Sent, Delivered, and Read receipts.
* **Message Management**: Edit or delete your messages globally across the network.

### 🎙️ Voice & Video (WebRTC)
* **Voice Calls**: High-quality, low-latency P2P voice calling with automatic voice activity detection.
* **Video Calls**: Full webcam support for face-to-face video calls.
* **Screen Sharing**: Share your entire screen or specific application windows.
* **Picture-in-Picture (PiP)**: Watch a screen share and a webcam feed simultaneously.
* **Device Management**: Select your preferred Microphone, Speakers, and Camera directly from the settings menu.

### 📁 Media & Files
* **Unlimited P2P File Sharing**: Send files of any size directly peer-to-peer. Files are chunked and streamed via Hypercore.
* **Drag & Drop**: Easily upload files by dragging them into the chat area.
* **In-App Media Player**: View images and watch videos directly inside the chat without downloading them externally.
* **Storage Management**: Built-in tools to view how much local disk space your Hubs and Whispers are using, with the ability to prune large files to free up space.

### ⚙️ Advanced & Under the Hood
* **Over-The-Air (OTA) Updates**: Built-in decentralized update system powered by Pear Runtime. Updates are broadcasted via a Gossip protocol and downloaded P2P.
* **F10 Developer Console**: A custom in-app F10 overlay that pipes Main Process (Node.js) logs directly into the React UI for easy debugging.
* **Resilient Local Storage**: A custom file-backed `localStorage` polyfill prevents Electron or OS updates from accidentally wiping your cryptographic identity.
* **Custom Themes**: Personalize the app's color palette (Base, Surface, Panel, Accent, Text) to your liking.

---

## 🏗️ Architecture & Codebase Overview

This repository is split into two main components: the **Client App** and the **Installer**.

### 1. Peercord Client App (Node.js / Electron / React)
The main application is built using Vite, React, TailwindCSS, and Electron. It utilizes the Holepunch ecosystem (`hyperswarm`, `corestore`, `hyperbee`) for P2P networking.

* **`src/p2p/index.js`**: The core `P2PNetwork` class. Manages the Hyperswarm instance, Corestore databases, and Hyperbee key-value stores.
* **`src/p2p/modules/`**:
  * `identity.js`: Cryptographic key generation and E2EE payload encryption/decryption.
  * `messaging.js`: Handles appending messages to local Hypercores and processing incoming messages from peers.
  * `servers.js`: Logic for creating, joining, and managing Hubs and Group Whispers.
  * `discovery.js`: DHT lookups for finding users by username and tracking peer cores.
  * `files.js`: Streams files into local Hypercores and downloads them from peers with progress tracking.
  * `webrtc.js`: Handles WebRTC signaling over the Hyperswarm connection, utilizing Perfect Negotiation to handle call collisions.
* **`index.js` (Main Process)**: The Electron backend. Handles window creation, single-instance locking, custom protocol streaming (`peercord://`), native desktop capturing for screen sharing, and the Pear Runtime OTA updater logic.
* **`index.html`**: Contains the custom file-backed `localStorage` polyfill and the instant-load splash screen.

### 2. Peercord Installer (C# / Avalonia UI)
Located in the `Peercord Installer Source/` directory, this is a cross-platform setup wizard built with Avalonia UI.

* **`MainWindow.axaml.cs`**: The UI logic for the setup wizard (Welcome -> Location -> Install -> Finish).
* **`Installers/Windows.cs`**: Handles downloading the Windows `.zip` release, extracting it safely, creating Start Menu/Desktop shortcuts via COM interfaces (`IShellLinkW`), and writing to the Windows Registry.
* **`Installers/Linux.cs`**: Handles downloading the Linux release, extracting it, setting `chmod +x` permissions, creating `.desktop` files, and applying XFCE/GNOME trust metadata.

---

## 🔐 The OTA Update System & Cryptography

Peercord uses a highly secure, decentralized update system. Updates are seeded via Pear Runtime, and update *notifications* are broadcasted over the P2P network using a Gossip protocol.

To prevent malicious actors from broadcasting fake updates, the system uses **Ed25519 cryptographic signatures**. 

### Setting up your own keys & Pear Links (For Forks/Developers)
If you fork this repository, you **must** generate your own cryptographic keys to broadcast updates and your own Pear link for the OTA updater. The codebase currently contains placeholders.

1. **Generate Keys**: Run `node scripts/genkeys.js` locally to generate an Ed25519 keypair.
2. **Public Key**: Place your generated Public Key in `src/p2p/utils.js` (`ADMIN_PUBLIC_KEY`). This is safe to be public and is used by clients to verify the update came from you.
3. **Private Key (Seed)**: Place your generated Private Seed in `scripts/broadcast-update.js` (`ADMIN_SEED_HEX`). **DO NOT COMMIT THIS FILE TO VERSION CONTROL.** Keep it strictly local.
4. **Generate Pear Link**: Run `pear touch` in your terminal to generate a new Pear link.
5. **Update package.json**: Replace all instances of the existing `pear://...` link (or `[PEAR_LINK]` placeholders) in `package.json` (specifically in the `upgrade` field and the `pear:stage`/`pear:seed` scripts) with your newly generated Pear link.

### Broadcasting an Update
When you are ready to release a new version:
1. Run `npm run bump` to increment the version in `package.json` and `version.js`.
2. Build and seed your app using Pear Runtime (`npm run release:win` or `npm run release:linux`).
3. The release scripts will automatically run `node scripts/broadcast-update.js`. This script will sign the new version number with your private key and flood the DHT with the announcement. Online clients will verify the signature against the public key in their source code and prompt the user to restart and update.

---

## 🛠️ Development Setup

### Prerequisites
* Node.js (v18 or higher)
* .NET 10.0 SDK (For building the installer)
* C/C++ Build Tools (For compiling native Node modules like `sodium-native`)

### Running the App Locally
```bash
# Install dependencies
npm install

# Start the Vite development server and Electron wrapper
npm run start
```

### Building the App
```bash
# Build the React UI
npm run build:ui

# Package for Windows
npm run package:win

# Package for Linux
npm run package:linux
```

### Building the Installer
```bash
# Navigate to the installer directory (assuming it's in the root)
# dotnet build -c Release
```

---

## 🤝 Contributing

Contributions are welcome! Because this is a P2P application, please ensure that any changes to the database schemas (`Hyperbee`) or message payloads (`Hypercore`) are backwards compatible, or include migration logic, to prevent breaking the network for older clients.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the GPLv3 License. See `LICENSE` for more information.
