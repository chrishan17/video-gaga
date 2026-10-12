# Sources and calculations

- **230 · 120 · 50**: an example sRGB colour (8 bits per channel), chosen by us.
- **The same numbers through deeper filters → #F7700F (247 · 112 · 15)**: 230 · 120 · 50 decoded with the sRGB transfer curve, mixed with Display P3 primaries (R 0.680/0.320, G 0.265/0.690, B 0.150/0.060, D65), and re-encoded in sRGB so the video can show it. It stays inside sRGB, so nothing is clipped. CIE76 ΔE between the two ≈ 16 (clearly visible side by side). Primaries: IEC 61966-2-1 (sRGB), Apple Display P3 / SMPTE EG 432-1.
- **216 · 126 · 67**: the Display P3 values that reproduce sRGB 230 · 120 · 50 (sRGB → linear → XYZ → P3 linear → P3 encoded), what colour management sends a P3 panel. Calculated with the same matrices; matches standard converters to ±1.
- **Almost twenty-five million windows on a 4K screen**: 3840 × 2160 pixels × 3 sub-pixels = 24,883,200.
- **Sixty times a second**: the common 60 Hz refresh rate of desktop monitors and most phones in their default mode.
- **Each number sets the angle**: in a twisted-nematic or similar LCD cell between crossed polarisers, the liquid crystal's voltage sets how far the light's polarisation is turned, and transmission follows cos² of the remaining angle. In the figure, each dial's angle is `acos(√L)`, where `L` is the number's linear light (sRGB decoding): the physics. The beams are drawn at the number's perceived brightness (value / 255), because at its true linear 3 % the blue beam would be invisible.
- **Backlight, polariser, liquid crystal, colour filter, front polariser**: the layer order of a transmissive LCD panel (backlight unit → rear polariser → TFT glass and liquid crystal → colour filter glass → front polariser).
