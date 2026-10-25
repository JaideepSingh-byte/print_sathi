# 🖨️ Print-Sathi | Unattended Shopkeeper Desktop Spooler

A standalone, unattended Windows desktop printing application built with **Electron** and **Node.js**. It listens to live paid print orders from Google Cloud Firestore, claims them atomically to prevent double-printing, validates the PDF binary, and sends them to the configured Windows physical or virtual printer.

---

## 🚀 Quick Start

### 1. Run the Student Website
In your root terminal:
```bash
npm start
```
Starts the student portal on `http://localhost:3000`.

### 2. Run the Shopkeeper Desktop App
In a separate terminal:
```bash
npm run shop:start
```
Launches the Electron desktop console.

---

## 🛡️ Built-in Safety & Architecture

1. **Atomic Order Claiming (`runTransaction`):**
   - Before downloading or spooling, the client claims the order in Firestore using a transaction (`where status == "QUEUED"` and `paymentStatus == "COMPLETED"`).
   - Tagged with `instanceId` and timestamp to prevent multi-terminal duplicate printing.

2. **Order Lifecycle State Machine:**
   $$\text{QUEUED} \longrightarrow \text{PRINTING (Claimed)} \longrightarrow \text{PRINT\_SUBMITTED} \longrightarrow \text{COMPLETED}$$
   *(Includes `FAILED` for invalid documents and `NEEDS_VERIFICATION` for crash recovery).*

3. **Crash Recovery:**
   - On startup, any jobs left in `PRINTING` from a prior app crash or power cut are moved to `NEEDS_VERIFICATION` instead of blindly re-printing.

4. **Dry-Run (Virtual) Mode:**
   - Active by default (`🛡️ Dry-Run: ON`). Simulates the exact print pipeline, downloads and validates documents, and logs mock spooler IDs without sending commands to physical hardware.
   - Toggle to physical hardware mode whenever you are ready with paper and toner!

5. **Windows Hardware Integration:**
   - Discovers installed Windows printers using `.NET` & PowerShell (`InstalledPrinters`).
   - Translates copies, duplex (single/double), and color mode.

---

## 📂 Architecture Layout

```
shopkeeper-app/
├── package.json               # Electron & Node dependencies
├── main.js                    # Electron main process (IPC handlers & window management)
├── preload.js                 # Secure ContextBridge API exposing desktopAPI
├── services/
│   ├── firebaseService.js     # Firestore onSnapshot, atomic transactions & state transitions
│   ├── printerService.js      # Windows printer discovery & spooler execution
│   └── orderProcessor.js      # State machine, PDF binary validation & queue loop
└── renderer/
    ├── index.html             # Distraction-free counter console UI
    ├── style.css              # Dark campus-tech styling
    └── renderer.js            # Real-time event receiver & control center
```
