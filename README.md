# Hydraulic Press vs Nokia 3310

Three.js scene: a hydraulic press tries to crush a Nokia 3310. The press loses. It overloads, cracks, pops its bolts, blows the ram plate apart, snaps a column and leaks hydraulic fluid everywhere. The phone lands face up and shows `3310 WINS`.

Everything is procedural: models, textures, particles and sound are all generated in code, so there are no asset files and you don't need Blender.

## Run

```bash
python3 -m http.server 8321
```

Then open http://localhost:8321 (or `?object=sodaCan` to preselect an object).

Controls: pick an object from the strip along the bottom (or keys **1–5**, **←/→**) · **Space** press · **R** reset · drag to orbit. Use the capacity slider to change the press's tonnage.

## How it decides what happens

Each object has a **behavior** and a **strength**. The simulation raises the hydraulic pressure and pushes the ram as far as the object's force curve allows:

| behavior | what happens | key params |
|---|---|---|
| `rigid` | doesn't move, so the press always overloads and destroys itself | – |
| `ductile` | yields and crumples or barrels, and stays squashed | `yield` (t), `crumple`, `bulge`, `folds`, `maxCompression` |
| `elastic` | squishes, then springs back when released | `stiffness` (t at 100%), `maxCompression` |
| `brittle` | holds, then shatters into fragments | `strength` (t), `fragments`, `fragmentShape` |

**If the object needs more force than the press can deliver, the press fails, whatever the behavior is.** For example, the Tungsten Cube (250 t) destroys a 100 t press but gets squashed by a 300 t one.

## Add your own object

Create `src/objects/myThing.js`:

```js
import * as THREE from 'three';

export default {
  id: 'myThing',
  name: 'My Thing',
  description: 'Shown in the side panel.',
  material: { behavior: 'brittle', strength: 12, fragments: 50 },
  build() {
    // Return any Object3D. Units are centimetres. Placement and centring are automatic.
    return new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), new THREE.MeshStandardMaterial({ color: 'tomato' }));
  },

  // Optional hooks
  onContact(ctx, obj) {},              // ram touches the object
  onLoad(ctx, obj, force, capacity) {}, // every frame while loading
  onStrainStart(ctx, obj) {},          // press begins to overload
  onStrain(ctx, obj, k) {},            // k: 0 → 1 until failure
  onPressFail(ctx, obj) {},            // press just exploded
  onLanded(ctx, obj) {},               // object fell off the broken press and came to rest
  shatter(ctx, obj) {},                // replace the default brittle fragmentation
  failMessage: 'Custom status text when the press dies',
};
```

Then register it in `src/objects/index.js`. `ctx` gives you `fx` (sparks/smoke/dust/fluid), `debris`, `sound`, `shake()`, `slowmo()`, `flash()` and `scene`.

A GLB model also works. Load it with `GLTFLoader` beforehand and return the scene from `build()`. That's where Blender could come in later, if you want a higher-detail model.

## Credits

- Nokia 3310 model: ["Nokia 3310"](https://sketchfab.com/3d-models/nokia-3310-67ce77f111394e738ba1be94c146ef29) by [Artemecia](https://sketchfab.com/Artemecia), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Rescaled, with material tweaks and a pixel LCD overlay. If `models/nokia3310/nokia_3310.glb` is missing, the app falls back to a procedural phone.

## Files

- `src/main.js`: renderer, camera, lights, UI and the main loop
- `src/simulation.js`: press state machine and force solver
- `src/pressObject.js`: behavior engine (force curves, vertex deformation, shatter, drop/tip)
- `src/press.js`: press model, overload effects and the explosion sequence
- `src/objects/*`: pressable objects
- `src/fx/*`: particles, debris physics and synthesized audio
- `src/ui/gauge.js`: SVG pressure gauge
