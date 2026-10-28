# News CG Graphics and Highlights Guide

Highlights are available in **Rundown & CG → Add/Edit Story → + News Highlight**. The HIGHLIGHT label appears in the topic tab above the headline, giving the headline full width without side label panels. Colors match the master CNN, BCC, or studio themes. One cue presents one headline. Add multiple cues in sequence for bulletin recaps, select in Production, and execute TAKE. Headline switching is strictly operator-controlled; there is no auto-rotation.

On the **Liputan7** template, the topic tab uses its distinct visual style: **burgundy** background, **ivory** text, **sand** accent border on the left, height 32 px, docked at the **top-left** of the headline plate (x=384). If the cue also shows a location, the topic tab stacks above the location tab. Interactive examples are available in `/templates/liputan7` and `/templates/cnn`.

In the Production panel, when Preview displays a **HIGHLIGHT** cue, the **→ / ←** arrow keys cycle between highlight headlines in that story; Space/Enter triggers TAKE/UPDATE. On regular cues, **→** triggers TAKE/UPDATE and **←** triggers OUT. SOT soundbite navigation uses `PageUp`/`PageDown`.

## Graphic Types & CNN References

Based on standard news broadcast design patterns:

| CG Type | Editorial Function | NewsCG Support |
|---|---|---|
| Headline / story strap | Main story title below the image | `HEADLINE`, single or with detail subline |
| Highlight / recap | Key selected headlines at bulletin opening/recap | `HEADLINE` with `headlinePresentation: "bulletin"`, `kicker: "HIGHLIGHT"`; one headline per cue |
| Kicker / topic strap | Topic context above headline | `kicker` + `showKicker` |
| Breaking / developing flag | Urgent or breaking news notification | `BREAKING`; flag text is editable. Developing can use HEADLINE kicker |
| Name strap / identifier | Presenter, reporter, or guest identification | `REPORTER`; name + role/affiliation |
| SOT identifier | Speaker identity while retaining story headline | `SOT`; headline + speaker name + role |
| Locator | Geographic location of report or visual | `LOCATION` or location field on cues |
| Station bug / LIVE / clock | Channel identity and broadcast status | Master logo, LIVE badge, clock/timezone |
| Ticker / crawl | Rolling bottom text | Ticker per rundown schedule or global (BCC) |

## Default News Anchor

The default news anchor name and title can be stored once in **Default Settings → News Anchor Defaults**.
In Production, pressing **P** prepares this anchor in Preview; **Space/Enter** executes TAKE or UPDATE to Program. Pressing **P** again returns Preview to the story cue without modifying Program; **Esc/C** triggers OUT. Compatible with CNN, Studio themes, Liputan7, and BCC News. Default anchors do not clutter rundown cue lists. See [NEWS_ANCHOR_DEFAULT.md](NEWS_ANCHOR_DEFAULT.md).

## Default Field Reporter

The default field reporter is configured in **Default Settings → Field Reporter Defaults** (name, role default `Reporter Lapangan`, optional location).
In Production, pressing **O** stages a `REPORTER` graphic in Preview; **Space/→** airs or updates it, **O** again reverts to the story cue, and **Esc/C/←** triggers OUT. This feature does not create rundown cues or alter master settings. See [REPORTER_LAPANGAN_DEFAULT.md](REPORTER_LAPANGAN_DEFAULT.md).

## Highlights Fields and Operation

The underlying template remains `HEADLINE`, ensuring compatibility with existing rundowns and TAKE/UPDATE/CLEAR workflows:

| Field | Value / Limit |
|---|---|
| `headline` | Required, 1–120 characters |
| `headlinePresentation` | `story` (default for legacy items) or `bulletin` |
| `kicker` | Topic tab label, max 60 characters; preset `HIGHLIGHT` |
| `showKicker` | Preset `"true"`; T button toggles topic visibility |
| `contentMode` | Set to `headline` for highlights |
| `layoutStyle` | Set to `single`; or `sub` if detail subline is needed |
| `showLocation`, `showDetail` | Preset `"false"`; string boolean flags |

## Editing via AI Agent

Start with `GET /api/agent`. `graphicPresets` provides `headline-bulletin`; `links.cgGuide` references this document. Combine the preset with verified headline text from the source:

```json
{
  "templateType": "HEADLINE",
  "sortOrder": 0,
  "draftFields": {
    "headline": "VERIFIED NEWS HEADLINE FROM SOURCE",
    "headlinePresentation": "bulletin",
    "kicker": "HIGHLIGHT",
    "contentMode": "headline",
    "layoutStyle": "single",
    "showLocation": "false",
    "showKicker": "true",
    "showDetail": "false"
  }
}
```

Post to `POST /api/items/{itemId}/graphics`, then verify with `GET /api/graphics/{graphicId}`. For editing:

```http
PATCH /api/graphics/{graphicId}
Content-Type: application/json

{"draftFields":{"headline":"REVISED HEADLINE","kicker":"HIGHLIGHT","showKicker":"true"}}
```

Material edits never alter Program snapshots or dispatch overlay events without explicit live operator commands.
