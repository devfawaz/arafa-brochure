# Arafa Homes brochure

An interactive 3D version of the tri-fold brochure I designed for Arafa Homes, serviced apartments in Kochi.

**Live:** https://devfawaz.github.io/arafa-brochure/

It starts closed. Open it one page at a time, turn it over, and switch between English and Arabic. Drag to look around.

## What it does

- **Reads one page at a time, in order.** It starts closed on the cover. Each tap or Next turns to the next page, and the camera glides to that page, square on: the cover, the welcome flap once the cover opens, then each inside page (right to left in Arabic). Close folds the flap in, then the cover over it, and turns the brochure over to end on the back page. Back steps one page at a time.
- **Turn over** shows the back panel when closed, and the full outside spread when open.
- **English and Arabic** editions switch instantly. Both are loaded up front.
- **Deep links:** `?lang=ar` opens in Arabic, `?page=3` starts on a page (1 is the cover).
- **Keyboard:** Enter, Space or → turns to the next page, ← goes back, T turns it over, L switches language. Screen readers hear each step.
- Respects reduced motion.

## How it's built

- **Three.js (WebGL).** Each panel is a thin box with the print file on the front and back and plain paper edges, at the real 9.33 × 21 cm proportions.
- **Seamless folds.** Hinges sit on the printed surface, so the panels meet exactly along each crease. On the outside, the crease edges and a thin spine are navy like the print around them, so no paper line shows. The cover lifts by a paper thickness only as it folds over the flap, so the stacked panels never clip.
- **Lighting.** A soft sky fill and one warm key light cast a real shadow on the floor, with a contact shadow that widens as the brochure opens.
- **Colour.** The renderer is colour-managed (sRGB, no tone mapping), so the navy and gold match the print file.
- **Camera.** Each page has its own framing, worked out from where the panel sits once folded, so a page fills the screen on phones and desktops. Between pages the camera eases along with the fold. You can still drag to look around (with damping, limited to angles that flatter the paper), and the reset button returns to the current page.
- **No build step.** Plain HTML, CSS and one module, with Three.js loaded from a CDN.

The artwork is the print-ready file from Illustrator, trimmed to the panels.

Design and build: Muhammed Fawaz. Brochure designed in 2025, interactive version built in 2026 with Claude Code.
