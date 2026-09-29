# 1984 visual notes

## Before

The square was already a stone town in Three.js: cobble, dirt, plaster shops, a fountain, autumn trees, and Pike's car parked by the roadster shop. The sky was a cool afternoon blue. The camera orbited the player. Holding the left button looks a full circle. The bank is a room with three booths, and the till opens as a swap with three balances. There is no inventory grid.

## After

Same town, same walk, same till. The hour is late afternoon. The sun sits low, the fog is warm, stall lanterns are on, the fountain basin is oxidized copper, and the water scrolls. A gold line circles the plaza. A paid lap drives the existing car once around that line and then parks it again. Dirt kicks up a little dust. Opening a shop eases the camera in. A successful payment nods the view. A refusal shakes it. Frozen KUSDT hangs a chain on that booth. A short banner says "One lap." or "Practice purse."

## Renderer

Three.js stays. It is the renderer the page already used for the orbit town, the bank room, and the left-button look. LittleJS, Pixelland, and HexGL were not imported. Putting a second engine under this page would be a new camera, and the walk is already a body on the grid.

## What stayed on purpose

- Click the ground to walk. Left and Right still turn. W A S D still walk the way you look. E still talks. Esc still closes.
- Holding the left button still looks a full circle. A short drag that springs back would undo that.
- The bank stays a swap popup with tKAS, POCencept, and KUSDT. The chest grid stays off. The reserve address stays on the bank line.
- Coffee is still 2.50, supper 14.00, a lap 100.00. The purse is still 20.00 and 20.00. One rail, one Buy. A lap is not free.
- No soundtrack.

## Blockers

None in the till. A payment still has to clear the server. The lap animation runs only after that spend succeeds.
