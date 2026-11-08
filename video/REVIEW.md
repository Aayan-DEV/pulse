# Review (2026-11-08)

## Second cut (after Aayan's notes)
Notes: the film did not show the full dashboards; slow where there was little text; too fast where a lot was shown.
1. Trains, Forecast, Staffing and Shift now play as camera tours over the full-page captures (see RIG.md).
2. Everything except the part that matters blurs under a stone veil, and that part gets a ring.
3. Each tour ends by pulling back to the whole dashboard.
4. The text-only scenes are shorter (tension 8 s to 5 s, reveal 5 s to 3.6 s, claims 4 s to 3 s). Dense panels hold for 1.5 to 2 s each.
5. The separate spike scene is merged into the Shift tour, so the camera scrolls down the same page to the spike card.

`hyperframes check`: 0 errors. 4 warnings say each tour uses the same image twice (the blurred copy and the sharp copy). That is intended.

## First cut

`hyperframes check`: 0 findings in lint, runtime, layout, motion, contrast, craft and audio.

## Frames looked at
0.2, 2, 4, 6.4, 8, 12.5, 16.5, 20, 22.5, 25.5, 29, 33, 36.2, 38.5, 40.5, 43, 46, 48.5, 51, 53.5, 57, 58.5 and 59.75 s.

## Fixed after the first look
1. The Today push-in covered the caption at 22.5 s. The camera now stays below the caption.
2. The "Why" panel was small at 25.5 s. It is now 1.15 times bigger.
3. The green ring missed the "confirmed" badge at 48.5 s. It now sits on the badge.
4. The end card went blank at 53.5 s. An inner id matched the scene's host id, so the fade hid the whole scene. The inner id is now `s8-brand`.
5. The radar's two dots showed early over "emergency" at 53.5 s. The mark is now hidden until it draws.

## Known limits
1. There is no music, only sound effects. A music bed needs a HeyGen sign-in, which this machine does not have.
2. The spike card says 101 orders against a likely 48 (top 78). The live alarm says 85 on pace against a top of 76. Both are real screens: the card froze its numbers when it opened, and the alarm is a projection taken at 11:59. This is a product inconsistency, not a video bug.
3. "Fewer emergency shifts", "Less waste" and "A calmer crew" are outcome lines. They are not measured results, and the film shows no money or savings figures.

## Credits (sound effects)
1. "Whoosh_Swish_03.wav" by www.bonson.ca, CC BY 3.0, https://freesound.org/people/www.bonson.ca/sounds/12658
2. "DSGNStngr_Big Impact.With Swoosh 4-3.Dark And Muffled_EM" by newlocknew, CC BY 4.0, https://freesound.org/people/newlocknew/sounds/790652
3. The short whoosh and the notification chime are bundled HyperFrames sounds.
