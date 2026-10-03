# Combat sound effects

Original files supplied by the user on 2026-10-04 from Freesound.org, copied without modification
except `industrial-pump.wav` (see below). Check each source page for its license before any
distribution outside this project.

| File | Source file | Use | Source |
| --- | --- | --- | --- |
| `punch.wav` | `104183__ekokubza123__punch.wav` | Technician, athlete, heavy robot and hero melee hits | https://freesound.org/people/ekokubza123/sounds/104183/ |
| `punch-02.wav` | `118513__thefsoundman__punch_02.wav` | Melee/ranged worker and melee/ranged robot hits | https://freesound.org/people/thefsoundman/sounds/118513/ |
| `whoosh.flac` | `60013__qubodup__whoosh.flac` | Ranged worker, ranged robot and Hello World launch | https://freesound.org/people/qubodup/sounds/60013/ |
| `explosive-punch.wav` | `833371__artninja__explosive_punchy_whoosh_fate_stay_night_hf_inspired_11132025.wav` | Judge hammer strike and GPT-4o hits | https://freesound.org/people/artninja/sounds/833371/ |
| `magic.wav` | `264981__renatalmar__sfx-magic.wav` | Support/counselor/singer buff pulse | https://freesound.org/people/renatalmar/sounds/264981/ |
| `industrial-pump.wav` | `468696__soundlover16__steal-works-industrial-pump.wav` | Firefighter spray launch | https://freesound.org/people/soundlover16/sounds/468696/ |

`industrial-pump.wav` is a derived clip: the source is a 96.29s continuous pump loop, far too long
for a one-shot cast sound. It is trimmed to the loudest opening 0.9s (its highest-energy window,
measured from the RMS envelope), downsampled from 24-bit to 16-bit PCM, and given a 5ms fade-in /
60ms fade-out to avoid a click at the cut point.

SHA-256 (of the files actually shipped here):

- punch.wav: `03e7d5f3d489e711d8bb8d868822aca5a3755ddef90ffbf72874f556e491c2fe`
- punch-02.wav: `2192e97bc3ab010582c04b976d2d9cadc9963804485f81c34b167509eae644e8`
- whoosh.flac: `7159ba26b74840da53965989c1472807891298528f94d720119777c251b3109e`
- explosive-punch.wav: `888601a63c87819403d886959f188c68d54ab9d9feff1a0b69d340b09aaa71bc`
- magic.wav: `42229788eb0157465f1ece0c398dc1591bcea2b2fb5c804dd813e21c12f2d0ef`
- industrial-pump.wav: `3fa1e233aae1de5b678724e3a7cbb6f0228f6d049bdb2cfdf63850e82d7ba00b`
