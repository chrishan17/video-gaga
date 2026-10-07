# 3D with three.js

Canvas 2D covers type, charts, diagrams and most motion graphics. Reach for three.js when **depth carries meaning**: a product you can turn around, a globe that shows where something happens, a stack of layers, a city of bars where height is the data. Don't use it as decoration. A spinning logo that could be flat should stay flat.

## Why it fits the pipeline

- three is imported as an ES module from a pinned CDN (`three@0.186.1`). It works when `video.html` is opened from disk *and* in the headless renderer. There's no install and no build.
- Headless Chromium renders WebGL with SwiftShader. Frames are **pixel-identical across pages and render order** (the determinism test covers the 3D presets). Expect about 30 ms per 1080p frame with shadows and MSAA.
- `CV.three()` shares one `WebGLRenderer` across all scenes, so a transition between two 3D scenes works and the WebGL context limit is never reached.

## The pattern

```html
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.min.js"}}</script>
<script src="build/narration.js"></script>
<script src="video-gaga.js"></script>
<script type="module">
import * as THREE from 'three';
const { ease, clamp, lerp } = CV;
const W = 1920, H = 1080;
const gl = CV.three(THREE, { width: W, height: H, shadows: true, exposure: 1.1 });

// 1) Build the world ONCE: geometry, materials, lights
const world = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
const hero = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.32, 240, 32), new THREE.MeshPhysicalMaterial({ color: '#d8d4cc', roughness: 0.25, clearcoat: 1 }));
world.add(hero, new THREE.HemisphereLight('#fff', '#667', 1.2));

CV.create({
  width: W, height: H,
  music: { bpm: 92, key: 'A', mode: 'minor', progression: [0, 5], layers: [{ inst: 'pad', pattern: 'X---', vel: 0.08 }] },
  scenes: [{
    id: 'hero',
    draw(ctx, s) {
      // 2) Every frame: set EVERY animated property from s.t (no deltas, no clocks)
      const p = ease.enter(clamp(s.t / 1.6));
      hero.rotation.set(0.3, lerp(-0.8, 0.4, p) + s.t * 0.05, 0);
      cam.position.set(0, 0.6, lerp(9, 6.5, p));
      cam.lookAt(0, 0, 0);
      // 3) Composite onto the 2D frame, then draw 2D type on top
      gl.render(ctx, world, cam);
      ctx.font = '700 96px "Geist"'; ctx.fillStyle = '#111'; ctx.fillText('Orbit One', 160, 900);
    },
  }],
});
</script>
```

## Rules

1. **Pure.** Set every animated property (positions, rotations, material colours and opacities, light intensities, the camera) from `s.t` in every `draw`. Never accumulate (`mesh.rotation.y += 0.01`). Frames render out of order in parallel pages.
2. **Build once, animate by assignment.** Create geometries and materials at load time. If a scene needs many objects, create them all and toggle `visible`.
3. **No `Math.random()` and no `THREE.MathUtils.seededRandom` with global state.** Use `CV.rand(seed)` at build time.
4. **Text in 3D:** use `gl.texture(key, w, h, paint)` with the 2D API, so the video's webfonts are used and repainted once loaded. Keep primary type in 2D on top of the render, where it's crisp and caption-safe.
5. **Transparent by default.** The renderer clears to transparent, so paint the 2D background (gradients, paper, grid) first and composite the 3D on top. Set `world.background` only for full-bleed 3D.
6. **Shadows cost.** `shadows: true` with a `2048` map is fine for one key light. Prefer a `ShadowMaterial` floor or a baked contact-shadow gradient over many shadow casters.
7. **Camera language still applies** ([motion-design.md](motion-design.md) §5): slow arrive-push, orbit 10–30° over a hold, no shaky cams. A 3D camera move is the loudest motion on screen, so keep 2D motion quiet while it moves.
8. **Add-ons** (`RoomEnvironment`, `RoundedBoxGeometry`, loaders, …) need a second import-map entry: `"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/"`. `PMREMGenerator` + `RoomEnvironment` gives cheap, deterministic studio reflections.
9. **Layered transparency: set `renderOrder`.** three sorts transparent objects by bounding-sphere centre, which flips with orientation (an ocean shell can paint over point-cloud land that doesn't write depth). Give every transparent layer an explicit `renderOrder`.
10. **Glows on a transparent renderer: no `AdditiveBlending`.** It writes alpha = 1 and shows as a black halo over the 2D backdrop. Use premultiplied one/one `CustomBlending` with a shader that outputs `vec4(color * i, i)`.
11. **Budget render time.** A lit, shadowed hero scene costs about 2× a 2D preset (≈140 ms per frame per worker at half resolution with shadows and room reflections). Draft at `--scale 0.5 --format jpeg`.
12. **Probe a 3D frame early** (`gaga still --at …`). Lighting is the first thing that goes wrong (too dark from ACES tone mapping: raise `exposure` or the light intensity).

## Good uses

| Content | 3D device |
|---|---|
| Product / feature launch | hero object on a seamless sweep, rim light, arrive-push, slow orbit, exploded view |
| Where in the world | globe with points and great-circle arcs, rotating to each place as it is named |
| Composition / architecture | stacked layers that separate on the word, each labelled |
| Comparisons at scale | bar city or columns whose heights grow from the data |
| Abstract concept | one simple form transforming (sphere → many) as the idea changes |

The **Studio 3D** (`studio-3d`) and **Data Globe** (`data-globe`) presets are working references.
