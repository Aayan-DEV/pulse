# Dashboard camera rig (shared pattern in s1, s4, s5, s6)

Each scene holds one full-page 2x capture inside `.X-cam` (CSS size = capture size / 2).

- `.X-base` is the page, which blurs and fades under a stone veil when something is in focus.
- `.X-sharp` is the same page, clipped with `clip-path: inset(...)` to the focus box.
- `.X-ring` is the highlight ring around the focus box.
- The camera moves `.X-cam` with x, y and scale. `cam(cx, cy, s)` puts page point (cx, cy) at screen (960, 500).

Panel boxes are in CSS px on the page, measured by matching each panel crop in `shots/` against its full-page capture
(exact pixel match). Pages: transit 1600x1886, forecast 1600x1000, staffing 1600x1598, shift 1600x1374.
