# BCC News Broadcast Template

The **BCC News** broadcast template is integrated into NewsCG alongside the **CNN / Studio** and **Liputan7 · HOC TV** templates. It adopts standard television broadcast geometry and animation timings inspired by CNN, tailored with BCC News visual identity, official branding, and color palette.

---

## 1. Visual Identity & Color Palette

Based on BCC News broadcast visual references:
- **Main Headline Bar (Headline Plate)**:
  - Background: Deep Dark Maroon (`#6B0908` / `#4A0706`)
  - Text Color: Crisp White (`#FFFFFF`), bold uppercase (Arial Narrow / Roboto Condensed / Arial)
  - Height: 106 px (188 px in clean single-line mode)
  - Height Transition: `transition: height 260ms cubic-bezier(.16,1,.3,1)` smooth expansion when detail toggles
- **Subline / Soundbite / Detail Bar (Subline Plate)**:
  - Background: Warm Cream / Peach Beige (`#F6D2A7`)
  - Text Color: Dark Charcoal / Maroon (`#1A1A1A`), regular font weight
  - SOT Divider: Deep maroon vertical bar (`#6B0908`) separating speaker name and role/title
  - Height: 82 px
- **Topic Tab / Kicker / Locator**:
  - Background: Vivid Orange (`#FF6115`)
  - Text Color: White (`#FFFFFF`), bold italic
  - Shape: Chamfered angled polygon tab on the top-right
  - Height: 52 px, aligned directly above the maroon headline plate
- **Permanent Master Logo Box**:
  - Position: Left-docked, flush with headline and subline plates
  - Background: Warm Cream (`#F6D5A9`), matching logo background pixels seamlessly
  - Dimensions: 192 × 188 px
  - Official Logo: "BCC NEWS" (`/branding/bcc.png` / `/branding/bcc.webp`) in maroon (`#720F0A` – `#5B0400`)
  - **Master Persistence**: Remains permanently mounted on screen; never unmounts or re-animates during headline entry (TAKE) or exit (CLEAR).
- **LIVE Badge**:
  - Position: Directly stacked atop the left logo box (`bottom: 100%`)
  - Dimensions: 192 × 52 px (exact same height as the adjacent kicker tab)
  - Background: Orange (`#FF6115`), bold white text "LIVE"
  - **Persistence**: Stable companion to the logo box throughout on-air sequences.
- **Ticker Bar (Bottom)**:
  - Background: Dark Maroon (`#4A0706` / `#360505`)
  - Height: 56 px
  - Real-time Clock: Docked on the **left** of the ticker bar directly under the logo box (width 192 px), deep maroon background (`#360505`), tabular white typography, and broadcast timezone.
  - Running Text: White (`#FFFFFF`) with orange bullet delimiters ("■") filling the space to the right of the clock.
  - Default Content: Pre-populated with `"INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI BCC NEWS"` when no custom text is provided.
- **Independent Master Controls in Production**:
  - Three dedicated master toggle buttons in Production:
    - **[1] LOGO**: Toggles logo box in Preview.
    - **[2] LIVE**: Toggles LIVE badge in Preview.
    - **[3] TICKER**: Toggles ticker bar in Preview.
    - **[M] APPLY MASTER**: Commits master staging configuration to Program.

---

## 2. Animation & Choreography

- **Master Layers (Logo, LIVE Badge, Ticker)**:
  - Animate in when enabled (`bcc-brand-in`, 420 ms).
  - Remain static and stable during on-air lower third transitions.
  - Animate out only when master layers are disabled, when Master Out (`0`) is toggled, or when **ALL OUT** (`CLEAR_ALL_ANIMATED`) is pressed.
- **Headline Entry (TAKE)**:
  - Maroon headline bar and cream subline bar slide horizontally from left to right (`bcc-panel-in`, 520 ms) revealing from behind the left logo box.
  - Orange kicker tab sweeps in from the left (`bcc-panel-in`, 400 ms, 100 ms delay).
  - Headline text slides up smoothly (`bcc-text-in`, 360 ms, 160 ms delay).
  - Subline/speaker text slides up smoothly (`bcc-text-in`, 340 ms, 240 ms delay).
- **Live Update (UPDATE)**:
  - Updates text seamlessly without replaying panel entry animations.
- **Headline Exit (CLEAR / OUT)**:
  - Text fades out (`bcc-text-out`, 160 ms).
  - Maroon and cream bars sweep back out to the left (`bcc-panel-out`, 360 ms).
  - Orange kicker tab sweeps out (`bcc-panel-out`, 280 ms).
  - Logo and LIVE badge remain stable on screen.
- **Detail Toggle (Hotkey `D` / `SWITCH_DETAIL`)**:
  - Detail Off: Subline bar slides out (`cg-detail-out` / `bcc-panel-out`, 220 ms) and headline bar expands from 106 px to 188 px.
  - Detail On: Headline bar contracts to 106 px and subline bar sweeps in.

---

## 3. Usage & Access

1. **Template Selection**:
   - In **Production**: Select **BCC News** in the broadcast template dropdown, inspect in Preview, then press **APPLY MASTER (M)**.
   - In **Settings**: Select **BCC News** under master broadcast defaults and click **Save Master Defaults**.
2. **Interactive Preview**:
   - Navigate to `/templates/bcc` to test BCC News graphic variations (SOT, Headline, Highlight, Reporter, Breaking) and animations interactively.
3. **Broadcast Output**:
   - The `/output` URL renders clean alpha transparency output for direct integration into broadcast switchers (vMix, OBS Studio, Wirecast).
