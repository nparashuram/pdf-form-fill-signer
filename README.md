# PDF Form Filler & Signer

A Chrome extension to fill out PDF forms, draw your signature, and add text annotations — then download the completed document. Everything happens locally in your browser; no files are ever uploaded anywhere.

## Features

- **Open any PDF** — load a PDF from your device directly in the extension viewer
- **Draw signatures** — use your mouse or trackpad to hand-draw a signature and place it anywhere on the page
- **Add text** — click anywhere on the page to type text (useful for filling in form fields)
- **Save & download** — export the completed PDF with all annotations baked in
- **100% private** — no servers, no uploads, no tracking

## Installation

### From the Chrome Web Store

Search for **PDF Form Filler & Signer** in the [Chrome Web Store](https://chrome.google.com/webstore) and click **Add to Chrome**.

### Manual install (developer mode)

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `chrome-pdf` folder.
5. The extension icon appears in your toolbar.

## How to Use

1. Click the **PDF Form Filler & Signer** icon in the Chrome toolbar.
2. Click **Open PDF File** and select a PDF from your device.
3. Use the toolbar at the top of the viewer:
   - **Open** — load a different PDF
   - **Sign** — draw a signature with your mouse, then click to place it on the page
   - **T Text** — click anywhere on the PDF to type text at that position
   - **Save** — download the finished PDF with all your changes applied
4. Repeat steps 3 as needed across any pages, then hit **Save** when done.

## Permissions

| Permission | Why it's needed |
|---|---|
| `storage` | Saves your uploaded signatures locally |

## Privacy

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md). The short version: nothing is collected, stored remotely, or shared.

## License

MIT
