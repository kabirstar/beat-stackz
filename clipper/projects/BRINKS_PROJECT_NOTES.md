# Per-Video Project Notes: `BRINKS` (`clipper/projects/BRINKS_PROJECT_NOTES.md`)

> **Living Per-Video Reference Document** — Last Updated: `2026-11-07`  
> **Master Audio**: `clipper/input/song/Brinks.m4a` (`103.201s` / `01:43.20`)  
> **Project State JSON**: `clipper/output/current_project.json` (`82` total timeline cuts: `67` camera cuts + `15` AI Morph Transitions + `26` `MAN ØN THE MØØN` VFX scenes)  
> **Rendered Master Exports**: `clipper/output/brinks_Seamless_Master.mp4` & `clipper/output/triller_edit.mp4` (`1920x1080`, `30 fps`, `h264_videotoolbox`, `0` black frames)

---

## 1. Purpose of Per-Video Project Docs

Whenever any human or AI agent works on a music video in **Clipper Studio**, a dedicated per-video file under `clipper/projects/<VIDEO_SLUG>_PROJECT_NOTES.md` records:
1. **Master Song & Acoustic Sync Profile** (duration, offsets, lyric phrases)
2. **Camera Angle Inventory & Visual Setting Guide** (what each `.MOV` file actually shows visually: wardrobe, props, lighting, framing, and usable song windows)
3. **Timestamped Lyrics Transcript**
4. **Complete VFX & AI Transition Map** (which scene indices carry which visual effects and why)

---

## 2. Camera Pool & Acoustic Sync Inventory (`10` Takes)

All 10 `.MOV` takes live in `clipper/input/clips/` with 720p browser proxies in `clipper/output/proxies/`.

| Clip ID | Filename | Duration | `song_offset_sec` | Sync Conf | Visual Setting, Wardrobe & Key Props |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`clip_1`** | `DSC_3580.MOV` | `84.28s` | `-8.188s` | `218.35` | **Indoor Living Room (Hero Sync Take)**: Artist in cream *Rolling Loud* hoodie & striped athletic pants holding/playing a **gold alto saxophone**. Framed against a credenza with a MIDI keyboard and colorful landscape paintings. Covers `0.0s–76.1s` of song. |
| **`clip_1793837253_2`** | `DSC_3604.MOV` | `96.80s` | `-4.531s` | `47.17` | **House Driveway, High-Ceiling Foyer & Garage Arch**: Artist in cream *Rolling Loud* hoodie & white sweatpants. Moves from driveway beside the sports car (`1.8s`) into the high-ceiling foyer (`5.2s`), under the balcony arch (`11.0s`), inside the open garage doorway (`77.1s`), and an **extreme macro close-up smiling with gold grillz** (`81.0s`). |
| **`clip_5`** | `DSC_3765.MOV` | `79.48s` | `-2.271s` | `42.16` | **Nighttime Outdoor Plaza / Christmas Tree Square**: Artist in a black **Balenciaga** crew neck with a vivid **crimson-red logo**, performing with two crew members in front of a giant lit tree, blue gift boxes, and a modern glass high-rise tower (`18.9s–40.3s`, `85.8s`). |
| **`clip_6`** | `DSC_3766.MOV` | `9.41s` | `+2.201s` | `131.33` | **Short High-Confidence Intro Take**: Tight performance take locked to `2.20s–11.61s` of the song. |
| **`clip_1793837303_3`** | `DSC_3643.MOV` | `191.09s` | `-113.018s` | `61.66` | **Matte-Grey Alfa Romeo Giulia in Driveway (Long Master Take)**: Starts with exterior walk-around of the matte-grey Alfa Romeo with glowing headlights & warm garage coach lights (`0.0s`), transitions to driver's seat shots through the open window (`17.4s`, `23.0s`), stepping out of the car door showing the back of the *Rolling Loud* hoodie (`38.1s`, `42.2s`), and performing beside the open car door (`53.9s–77.0s`). |
| **`clip_4`** | `DSC_3728.MOV` | `7.71s` | `+10.787s` | `12.48` | **Nighttime City Shopping Street**: Walking away/performing down a tree-lined shopping avenue wrapped in warm white string lights (`14.7s`, `101.7s`). |
| **`clip_1793837404_4`** | `DSC_3698.MOV` | `53.25s` | `+2.004s` | `71.28` | **Rooftop Parking Deck at Night**: Artist in cream *Rolling Loud* hoodie on a rooftop garage deck with an illuminated glass skyscraper and parked sports car behind him (`24.8s`, `100.4s`). |
| **`clip_1793837208_1`** | `DSC_3602.MOV` | `90.09s` | `-10.398s` | `54.88` | **Wide Low-Angle Driveway Hero Shot**: Wide lens low-angle framing next to the Alfa Romeo and wooden garage doors with a wide expanse of open night sky above the house roofline (`36.6s`, `82.9s`, `91.5s`). |
| **`clip_3`** | `DSC_3727.MOV` | `1.10s` | `+38.522s` | `22.94` | **Quick Cutaway Accent Clip**: Short 1.1s B-roll accent around `38.5s`. |
| **`clip_1793837432_5`** | `DSC_3724.MOV` | `21.32s` | `+56.100s` | `8.12` | **Sidewalk Crew Cypher by Concrete Trash Bin**: 4-person nighttime sidewalk cypher next to a round concrete street bin (`64.6s`, visually paralleling the Paris street bin shot at `00:35` in *MAN ØN THE MØØN*). |

---

## 3. Complete Timestamped Lyrics Transcript (`Brinks.m4a`)

Transcribed via `faster-whisper` and aligned to the master song timeline (`49` phrase windows):

| Song Window | Transcribed Lyric Phrase | Active Primary Camera Cuts |
| :--- | :--- | :--- |
| `00.00s – 01.74s` | *[Instrumental Intro — Alfa Romeo Headlights]* | `#00` (`DSC_3643.MOV` — `motm_nasa_card`) |
| `01.74s – 03.84s` | *"Yeah, yeah, I just want to race,"* | `#01` (`DSC_3604.MOV` — `motm_sky_cosmos`), `#02` (`AI_TRANS`) |
| `04.02s – 05.38s` | *"don't care about the fights It's good"* | `#03` (`DSC_3580.MOV` — Gold Sax `motm_bleach_pop`) |
| `05.38s – 06.50s` | *"moving brakes, so I got a whole"* | `#04` (`DSC_3604.MOV` — `motm_doorway_portal`) |
| `06.50s – 07.24s` | *"lot of gold"* | `#05` (`DSC_3765.MOV`), `#06`–`#07` (`AI_TRANS`) |
| `07.78s – 09.56s` | *"And don't make you get out the spot"* | `#08` (`DSC_3604.MOV`), `#09` (`AI_TRANS`) |
| `09.67s – 10.98s` | *[Saxophone / Vocal Ad-Lib]* | `#10` (`DSC_3580.MOV` — `motm_diamond_grillz`) |
| `11.44s – 13.42s` | *"But money's thick, quick, to let go of me"* | `#11` (`DSC_3604.MOV` — `motm_motion_echo`), `#12` (`AI_TRANS`) |
| `13.86s – 15.34s` | *"I got my mess on that day,"* | `#13` (`DSC_3643.MOV`), `#14` (`DSC_3728.MOV` — `motm_dutch_flash`) |
| `15.82s – 17.46s` | *"never be here over a rain"* | `#15` (`AI_TRANS`), `#16` (`DSC_3580.MOV`) |
| `17.86s – 19.16s` | *"I should put it up on the same,"* | `#17` (`DSC_3643.MOV`), `#18` (`DSC_3765.MOV` — `motm_bleach_pop`) |
| `19.80s – 21.58s` | *"JF I put to that game I'm"* | `#19` (`DSC_3643.MOV`), `#20` (`DSC_3765.MOV`) |
| `21.58s – 22.92s` | *"a little ski slob in that rain,"* | `#21` (`AI_TRANS`) |
| `23.16s – 25.28s` | *"I've been killing it Race on that day, yeah,"* | `#22` (`DSC_3643.MOV`), `#23` (`DSC_3698.MOV` — `motm_lunar_env`) |
| `25.60s – 28.64s` | *"to what you got, rig on the team I'm at the spyway, got a line seen"* | `#24` (`DSC_3580.MOV` — `motm_roto_clone`), `#25` (`DSC_3765.MOV` — `motm_sky_cosmos`) |
| `29.75s – 34.10s` | *[Hook / Bridge Drop]* | `#26` (`AI_TRANS`), `#27` (`DSC_3580.MOV`), `#28` (`DSC_3765.MOV` — `motm_eagle_shoulder`) |
| `34.10s – 36.22s` | *"My money stinking queen til I call me"* | `#29` (`DSC_3580.MOV`), `#30` (`AI_TRANS`) |
| `36.72s – 38.24s` | *"I got my mess called I bang"* | `#31` (`DSC_3602.MOV` — `motm_sky_cosmos`) |
| `38.68s – 40.22s` | *"Yeah, I'm being overrated"* | `#32` (`DSC_3643.MOV` — `motm_fg_hands`) |
| `40.72s – 43.62s` | *"I should put it up and we'll say Yeah, if I put you like"* | `#33` (`DSC_3580.MOV`), `#34` (`AI_TRANS`), `#35` (`DSC_3643.MOV` — `motm_ink_corrupt`) |
| `43.62s – 45.40s` | *"me I'm gonna ski slide up in"* | `#36` (`DSC_3643.MOV`) |
| `45.40s – 48.36s` | *"that lane Yeah, I pull out my making up I'm busting that tune, yo"* | `#37` (`DSC_3580.MOV` — `motm_roto_clone`), `#38` (`DSC_3643.MOV`) |
| `48.36s – 50.72s` | *"man No favor, how am I hivin?"* | `#39` (`DSC_3580.MOV` — `motm_fg_hands`) |
| `51.00s – 55.54s` | *"I just catch that blue bitch I feel like"* | `#40`–`#41`, `#42` (`AI_TRANS`), `#43` (`DSC_3643.MOV` — `motm_eagle_shoulder`) |
| `55.54s – 58.18s` | *"an enemy to see me Pop out of the gym and you just said"* | `#44`–`#45`, `#46` (`AI_TRANS`) |
| `58.80s – 60.28s` | *"I'm up for the carry me, let me"* | `#47` (`DSC_3580.MOV` — `motm_dutch_flash`), `#48`–`#49` |
| `60.76s – 63.16s` | *"Fuck out the motor, I tell the streets I'm in all"* | `#50` (`DSC_3643.MOV` — `motm_motion_echo`), `#51` (`DSC_3580.MOV`) |
| `63.16s – 65.96s` | *"black, I feel like you're pure Well, up the fence, want the whole damn"* | `#52` (`AI_TRANS`), `#53` (`DSC_3724.MOV` — `motm_ink_corrupt`) |
| `65.96s – 69.64s` | *"tree I still kiss, with all the tears And then I'll hurt the bare, why I talk to"* | `#54`–`#56` |
| `69.64s – 74.00s` | *"my fruits I talk to my friends, let me blame you You can't feel it, since you leave me with me"* | `#57`–`#60`, `#61` (`AI_TRANS`) |
| `74.00s – 87.11s` | *"It's like..." [Saxophone & Hook Breakdown]* | `#64` (`motm_doorway_portal`), `#65` (`AI_TRANS`), `#67` (`motm_diamond_grillz`), `#68` (`motm_lunar_env`), `#70` (`motm_bleach_pop`) |
| `87.11s – 103.20s` | *[Instrumental & Vocal Outro ("You")]* | `#71` (`AI_TRANS`), `#76` (`motm_dutch_flash`), `#79` (`AI_TRANS`), `#80`–`#81` |

---

## 4. Complete Map of Wired `BRINKS` VFX (`28` Cuts) & AI Morphs (`15` Cuts)

> **Thematic Adaptation Note (`2026-11-07`)**: Per Kabir's direction, instead of transporting the artist into outer space / lunar environments as in *MAN ØN THE MØØN*, the `Brinks` video adapts those exact Laughtodabank VFX techniques (`motm_sky_cosmos`, `motm_lunar_env`, `motm_doorway_portal`, `motm_nasa_card`) to transport him into a **Stainless-Steel Bank Vault overflowing with $100 bills & gold bars** (`assets/motm/brinks_bank_vault_plate.jpg`), in front of an **Armored Brinks Heist Truck with open rear vault doors & raining cash** (`assets/motm/brinks_truck_heist_plate.jpg`), and under a **Night Sky Raining $100 Bills & Giant Bank Vault Wheel** (`assets/motm/brinks_money_sky_plate.jpg`).

### A. Wired Laughtodabank-Style `BRINKS` VFX Scenes (`vfx_motm_engine.py`)

| Seg `#` | Song Window | Source Clip | Wired Effect ID | Why This Scene Was Selected |
| :--- | :--- | :--- | :--- | :--- |
| **`#00`** | `0.00s – 1.81s` | `DSC_3643.MOV` | `motm_nasa_card` | Opening Alfa Romeo Giulia headlight walk-around carries the **`BRINKS // ARMORED VAULT ($100 HEIST EDITION)`** rotating steel vault wheel security emblem over a bleach-bypass grade. |
| **`#01`** | `1.81s – 3.44s` | `DSC_3604.MOV` | `motm_sky_cosmos` | Open night sky above the house driveway roofline replaced with camera-tracked **Raining $100 Bills & Giant Illuminated Bank Vault Wheel** (`brinks_money_sky_plate.jpg`). |
| **`#03`** | `3.99s – 5.24s` | `DSC_3580.MOV` | `motm_bleach_pop` | Living room performance holding the **gold alto saxophone** — silver monochrome room with selective gold saxophone color pop. |
| **`#04`** | `5.24s – 6.69s` | `DSC_3604.MOV` | `motm_doorway_portal` | High-ceiling foyer architectural opening masked into a 2.5D parallax portal looking straight into the **Bank Vault overflowing with cash & gold bars**. |
| **`#09`** | `9.17s – 9.67s` | `AI_TRANS` | `motm_lunar_env` | Pre-sax bridge transported into the **Stainless-Steel Bank Vault** (`brinks_bank_vault_plate.jpg`). |
| **`#10`** | `9.67s – 10.98s` | `DSC_3580.MOV` | `motm_diamond_grillz` | Close-up gold saxophone shot enhanced with razor-sharp optical star-filter diamond glints. |
| **`#11`** | `10.98s – 12.95s` | `DSC_3604.MOV` | `motm_motion_echo` | Sweeping arm gesture under the balcony arch leaves a 3-tap step-printed ghost trail with silver-cyan rim tint behind the isolated performer. |
| **`#14`** | `14.74s – 15.70s` | `DSC_3728.MOV` | `motm_dutch_flash` | Nighttime city street with string lights hits with a 2-frame white shutter flash + `13.5°` decaying Dutch-angle whip-zoom. |
| **`#18`** | `18.91s – 19.93s` | `DSC_3765.MOV` | `motm_bleach_pop` | Night plaza performance in the **Balenciaga** sweater — silver bleach-bypass base while the crimson-red Balenciaga logo pops. |
| **`#23`** | `24.78s – 25.75s` | `DSC_3698.MOV` | `motm_lunar_env` | Rooftop parking deck hero stance full-body roto-transported inside the **Stainless-Steel Bank Vault with towering pallets of $100 bills & gold bullion** (`brinks_bank_vault_plate.jpg`). |
| **`#24`** | `25.75s – 28.09s` | `DSC_3580.MOV` | `motm_roto_clone` | Synced double-performance roto-clone performing alongside himself in the living room. |
| **`#25`** | `28.09s – 29.75s` | `DSC_3765.MOV` | `motm_sky_cosmos` | Artist pointing hand up into the night sky beside the glass tower — sky replaced with tracked **Raining $100 Bills & Giant Bank Vault Wheel**. |
| **`#28`** | `31.97s – 34.10s` | `DSC_3765.MOV` | `motm_eagle_shoulder` | 3-man plaza crew stance with the real photographic **Bald Eagle** (`eagle_rgba.png`) perched on the performer's right shoulder. |
| **`#31`** | `36.59s – 38.10s` | `DSC_3602.MOV` | `motm_sky_cosmos` | Wide low-angle driveway shot with expansive upper night sky replaced with **Raining $100 Bills & Giant Bank Vault Wheel**. |
| **`#32`** | `38.10s – 40.32s` | `DSC_3643.MOV` | `motm_fg_hands` | Artist throwing both hands toward the lens framed by twin oversized, lens-blurred foreground hand cutouts (`fg_hands_rgba.png`). |
| **`#35`** | `42.23s – 43.83s` | `DSC_3643.MOV` | `motm_ink_corrupt` | Stepping out of the car showing the back of the grey *Rolling Loud* hoodie — glossy black ferrofluid ink crawls across the hoodie cloth. |
| **`#37`** | `45.35s – 47.14s` | `DSC_3580.MOV` | `motm_roto_clone` | Synced double-performance roto-clone in the living room. |
| **`#39`** | `48.36s – 50.52s` | `DSC_3580.MOV` | `motm_fg_hands` | Reaching hand toward the camera framed by oversized foreground hand cutouts with optical defocus. |
| **`#43`** | `53.88s – 55.23s` | `DSC_3643.MOV` | `motm_eagle_shoulder` | Standing by the open Alfa Romeo door with the tracked perched Bald Eagle on his shoulder. |
| **`#47`** | `58.19s – 59.06s` | `DSC_3580.MOV` | `motm_dutch_flash` | Fast beat cut punctuated by a 2-frame white shutter exposure flash + Dutch-angle whip-zoom. |
| **`#50`** | `60.95s – 62.88s` | `DSC_3643.MOV` | `motm_motion_echo` | Walking beside the car in the white hoodie with a 3-tap step-printed motion echo fan. |
| **`#53`** | `64.65s – 66.15s` | `DSC_3724.MOV` | `motm_ink_corrupt` | Sidewalk cypher next to the concrete trash bin (direct homage to `00:35` in *MAN ØN THE MØØN*) with black-ink fabric corruption. |
| **`#55`** | `67.42s – 68.78s` | `DSC_3765.MOV` | `motm_lunar_env` | Full-body roto transport in front of the **Armored Brinks Heist Truck with open rear vault doors & raining $100 bills** (`brinks_truck_heist_plate.jpg`). |
| **`#64`** | `77.08s – 78.63s` | `DSC_3604.MOV` | `motm_doorway_portal` | Standing beside the open white garage archway — the dark archway interior becomes a portal revealing the **Armored Brinks Truck & raining $100 bills** behind him. |
| **`#67`** | `81.03s – 82.87s` | `DSC_3604.MOV` | `motm_diamond_grillz` | Extreme macro close-up smiling with **gold grillz** — razor-sharp optical star-filter diamond glints bloom across the grillz. |
| **`#68`** | `82.87s – 83.85s` | `DSC_3602.MOV` | `motm_lunar_env` | Low-angle hero stance roto-transported in front of the **Armored Brinks Heist Truck with open rear doors, duffle bags of cash & raining $100 bills** (`brinks_truck_heist_plate.jpg`). |
| **`#70`** | `85.75s – 87.11s` | `DSC_3765.MOV` | `motm_bleach_pop` | Raising arm in the Balenciaga sweater — silver bleach-bypass grade with selective crimson Balenciaga logo pop. |
| **`#76`** | `94.06s – 95.96s` | `DSC_3765.MOV` | `motm_dutch_flash` | Outro plaza cut with 2-frame white shutter exposure flash + Dutch-angle whip-zoom. |

### B. Existing `15` AI Morph Transitions (`cut_reason == "ai_transition"`)
- Segments `#02`, `#06`, `#07`, `#09`, `#12`, `#15`, `#21`, `#26`, `#30`, `#34`, `#42`, `#46`, `#52`, `#61`, `#65`, `#71`, `#79` (`15` distinct boundary bridges including the saxophone-to-finger morph at `30.35s` / Seg `#26`).
