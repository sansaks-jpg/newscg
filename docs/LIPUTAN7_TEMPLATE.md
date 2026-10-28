# Liputan7 / HOC TV Broadcast Template

Selectable via **Broadcast template → Liputan7 · HOC TV** in Production or Settings. Changes staged in Production appear on Preview; **APPLY MASTER / M** applies them to Program. The `/templates/liputan7` gallery does not open SSE connections or execute live commands. The standalone `/output` URL renders the identical alpha output as Program.

## Identity & Composition

- HOC TV logo faithfully mirrors user-provided branding, including the roof-shaped letter 'O'.
- Liputan7 standalone logo functions without HOC text.
- Palette: burgundy `#790D16`, sand `#E5D3AF`, ivory `#F5EFE1`, blue `#AEC4D4`.
- Program logo box: x=96, y=826, 288×146 px. Headline plate starts at x=384 and ends at x=1850 (70 px right margin, identical to CNN).
- Topic / HIGHLIGHT tab docks on the **top-left** of the headline plate (x=384), adhering to CNN top-tab conventions. Palette: burgundy `#790D16`, ivory `#F5EFE1` text, 7 px sand accent line `#E5D3AF` on the left, height 32 px, 20 px bold uppercase. If a location tab is also active, the topic tab stacks 32 px above it.
- Headline and names use Barlow Semi Condensed 500; details, locations, clock, and ticker use standard Arial. WOFF2 fonts are bundled locally with zero CDN or external font dependencies during broadcast.
- Locator appears in a tab above the headline. Subline details appear on a blue accent strip. Dynamic text leverages `AutoSquishText` within clipping viewports to avoid text overflowing broadcast margins.
- Three independent master toggles in Production: **Program Logo (1)**, **TV Logo (2)**, and **Ticker (3)**. Weather accompanies the program logo, LIVE accompanies the TV logo, and clock accompanies the ticker.

## Motion & Transitions

Based on broadcast reference analysis:
- Base plate expands from the program logo to the right, followed by headline and detail plates; locator follows.
- Live `UPDATE` retains DOM nodes without replaying entrance animations.
- `CLEAR` smoothly animates elements out while maintaining master layers.
- Reference timing at 60 fps:
  - Entrance: Red base 600 ms; ivory plate starts at +200 ms for 500 ms; headline text enters at +400 ms for 350 ms. Detail starts at +400 ms, location at +700 ms.
  - Exit: Location exits first; text at +300 ms, ivory at +400 ms, base plate at +450 ms (completing at 1,050 ms within 1,100 ms retention).
- Rotating weather ticker appears after a 10-second idle period on the program logo, showing 7 scheduled cities (3 seconds read time per city).

## Highlights & Keyboard Shortcuts

HIGHLIGHT uses the `HEADLINE` template with `headlinePresentation: "bulletin"` and `kicker: "HIGHLIGHT"`.

In Production:
- **→** on regular cues triggers TAKE/UPDATE; **←** triggers OUT.
- When Preview is a HIGHLIGHT cue, **→ / ←** navigates between highlight headlines within that story.
- Space/Enter triggers TAKE/UPDATE. `Esc`/`C` triggers OUT.
- **↑ / ↓** navigates stories; soundbites are selected via `PageUp`/`PageDown`.
- **P** stages default news anchor; **O** stages default field reporter.

## Automatic Weather Data

Source: BMKG (https://data.bmkg.go.id/prakiraan-cuaca/).
Server fetches forecasts for configured adm4 region codes, caching responses up to 10 minutes. Falls back cleanly without fabricating temperatures if data is unavailable.
