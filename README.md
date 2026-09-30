# Arafa Homes brochure

An interactive 3D version of the tri-fold brochure I designed for Arafa Homes, serviced apartments in Kochi.

**Live:** https://devfawaz.github.io/arafa-brochure/

It starts closed. Open it one page at a time, turn it over, and switch between English and Arabic. Drag to look around.

## What it does

- **Opens one page at a time, in order.** Tap the brochure or press Next: first the cover swings open and shows the welcome flap, then the flap opens to the full inside spread. Back steps one page at a time; Close folds the flap in, then the cover over it.
- **Turn over** shows the back panel when closed, and the full outside spread when open.
- **English and Arabic** editions switch instantly. Both are loaded up front.
- **Deep links:** `?lang=ar` opens in Arabic, `?open=1` starts open.
- **Keyboard:** Enter, Space or → turns to the next page, ← goes back, T turns it over, L switches language. Screen readers hear each step.
- Respects reduced motion.

## How it's built

- **Three.js (WebGL).** Each panel is a thin box with the print file on the front and back and plain paper edges, at the real 9.33 × 21 cm proportions.
- **Seamless folds.** Hinges sit on the printed surface, so the panels meet exactly along each crease, with a thin paper spine on the outside of the fold. The cover lifts by a paper thickness only as it folds over the flap, so the stacked panels never clip.
- **Lighting.** A soft sky fill and one warm key light cast a real shadow on the floor, with a contact shadow that widens as the brochure opens.
- **Colour.** The renderer is colour-managed (sRGB, no tone mapping), so the navy and gold match the print file.
- **Camera.** Orbit with damping, limited to angles that flatter the paper. It moves in or out with the fold, so the brochure fills the screen closed or open on phones and desktops.
- **No build step.** Plain HTML, CSS and one module, with Three.js loaded from a CDN.

The artwork is the print-ready file from Illustrator, trimmed to the panels.

Design and build: Muhammed Fawaz. Brochure designed in 2025, interactive version built in 2026 with Claude Code.
