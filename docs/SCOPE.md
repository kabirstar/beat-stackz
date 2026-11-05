# BeatStackz scope and timeline

Decided by Kabir on 2026-11-05, over two rounds. Proposed timeline by Claude.
Source page: https://claude.ai/artifact/FfDiiPgAtGkKuWwHKRejqy
(round 1 recap: https://claude.ai/artifact/BsNzZAqtWVCEVz3QRCmNq8).

**This file wins over older docs where they disagree.**

## What it is

One place for an artist or producer to take a song from first idea to release.
It starts as a safe, private vault for files that is great at sharing. Planning
with a vision board and task list comes with it. A song workspace, video
editing, marketing, and later a social side and a store grow on top.

The first users are Kabir, Swish, Deezy and Ski. It is built for what they need
first, and opened to others after milestone 2. The name is spelled BeatStackz.

## Timeline

| Milestone | Name | Dates (estimates) |
|---|---|---|
| 1A | Safe foundation | Nov 6 to Nov 16 |
| 1B | Crew-ready | Nov 17 to Dec 7 |
| 2A | Sharing | Dec 8 to Dec 28 |
| 2B | Library | Dec 29 to Jan 18 |
| 2C | Open the doors | Jan 19 to Feb 1. Sign-up opens at the end. |
| 3 | Song workspace | Feb, rough |
| 4 | Video | Mar, rough |
| Later | Marketing and apps | not dated |
| Vision | The big four | not designed yet |

**These dates are estimates.** The whole first version (accounts, uploads,
sharing, hosting) landed in 54 merged changes over two days, Oct 22 and 23.
Since then work has landed on about one day in three. The dates assume agents
run most days and Kabir checks in twice a week. Milestone 1 is a fair guess.
Everything after January is rough and will move.

## The milestones

### 1A. Safe foundation (Nov 6 to Nov 16, estimate)

Done when: what merges goes live by itself, and nothing the crew uploads can be
lost or seen by the wrong person.

- Deploys work and the live site is current. It is 13 days behind today.
- Nightly backups (moved in by Claude)
- A staging copy of the site
- Error alerts, and crashed services restart themselves
- Password reset and email confirmation
- Security pass: invite-only sign-up enforced on the live site, limits on login
  attempts, every route checked for who can reach it, main branch protected,
  the hosting panel moved to a secure address
- Fix what felt off when Kabir and Swish use it together

### 1B. Crew-ready (Nov 17 to Dec 7, estimate)

Done when: the four of you use it for real work instead of texting files, and
it looks like a finished product.

- Five roles in a shared vault: owner, manager, editor, commenter, viewer
- Invite someone who has no account yet
- Log in with Google
- Vision board that saves and is shared live: sticky notes, pinned songs,
  images, links. In shared vaults and your own.
- Session task list: name, person, due date, linked song, done
- The screens redone, keeping the idea: folder icons, vault door, colours,
  animations
- Works well in a phone browser
- Themes and icon order saved to the account
- Vault history a user can see
- Keyboard and screen reader basics

### 2A. Sharing (Dec 8 to Dec 28, estimate)

Done when: sending a beat from here beats every other way of sending it.

- Share a folder or a playlist by link
- Per link: stream-only or download, password, expiry
- See who played it and when
- File request links
- Comments, and comments pinned to a moment in the track
- Activity feed, with changes showing live
- Notices in the app, by email and in Discord
- Versions of one track
- Board extras: voice memos, drawing, comments (moved by Claude)

### 2B. Library (Dec 29 to Jan 18, estimate)

Done when: you can find any file in seconds and play it instantly.

- Search, sort and filter
- Tags, BPM and key, typed in and detected
- Smaller streaming copy for fast playback, and MP3 download
- Upload a whole folder; download a folder as a zip
- Playlists, favourites, recents, notes, cover art
- Previews for video, images and PDFs
- Stem splitting and mastering (needs a call)

### 2C. Open the doors (Jan 19 to Feb 1, estimate)

Done when: a stranger can sign up safely. Sign-up opens at the end of this.

- Terms, privacy page, a way to report stolen content, minimum age 13
- Admins can open a user's files only with their OK
- Storage limits and the free amount
- Delete my account; download everything I own (moved by Claude)
- Audio watermark on shared previews (moved by Claude)
- An admin screen: users, storage used, remove an account
- Firefox, Edge and Android Chrome tested
- The live site updates per milestone, from staging

### 3. Song workspace (Feb, rough)

A Song becomes its own thing, not just a folder.

- Stages: idea, demo, rough mix, final mix, mastered
- Lyrics, credits, reference tracks, a board per song
- To-dos, due dates, release checklist, approve or reject a version
- Split sheets, albums and EPs, chat inside a vault

### 4. Video (Mar, rough)

Clipper and Reel Studio become one video tool connected to the vault.

- First feature: an Open in Clipper button that pulls the song and takes from a
  vault and saves the finished video back
- Rendering runs on the user's own computer first, on our servers later
- Then: login, several projects, vertical export, lyric captions, one-tap auto
  edit, sharing a video by link

### Later. Marketing and apps (not dated)

- Artist page, one link to a release everywhere, release calendar, stats
- AI cover art and captions, post scheduling
- Phone app, desktop sync, DAW plugin, team accounts, two-step login

### Vision. The big four (not designed yet)

Wanted, not planned. Milestones 1 to 3 are built so these can be added without
a rewrite, mainly through usernames and public profiles.

- Profiles, follows and messaging. This one ships first if any does.
- A store for beats, plugins and presets
- A public catalog
- Distribution to Spotify and Apple Music
- Paid subscriptions, once there is an actual product and costs pass the ceiling

## Rules

| Rule | Decision |
|---|---|
| Who decides | Kabir owns the product. Swish helps and can do everything Kabir can, except: changing the scope, spending money, hosting and keys, opening sign-up, deleting data for real, and reversing a decision. Swish signs off on big changes to the look only. |
| New ideas | Go on the list for a later milestone unless Kabir approves them. Agents propose before they build. Agents write all the code. Revisit this scope every two weeks. |
| When late | Move the date. Don't ship half of it. |
| Unfinished work | Hidden behind a switch. A preview that does not save yet is allowed only if it is clearly labelled. |
| Sign-up | Invite only through milestone 1. Opens after milestone 2. Email must be confirmed. Email and password or Google. One person may hold several accounts. |
| Roles | Owner, manager, editor, commenter, viewer. Managers are named by the owner and can delete and manage. Editors upload, organise, and can delete their own uploads. Owner and managers invite. The owner decides per vault whether viewers can download, and per person who can change the board. |
| Share links | Open without an account. Play only unless the owner allows download on that link. Expire in 30 days. Die with the file. |
| Vaults | As many personal vaults as you want. Folders to any depth. Default folders can be renamed or deleted. You must accept an invite to a shared vault. Files can move between vaults. |
| Files | Any type, up to 10 GB each. A file sent to a shared vault is the same file in both places. The same name twice keeps both, adds a number, and shows who uploaded each. Trash keeps things 30 days. |
| Storage | 200 GB each for the crew. A shared vault counts against its owner. The free amount for new users is decided before sign-up opens. |
| Leaving | Someone leaving a shared vault chooses what happens to their uploads. An owner hands the vault over before deleting their account, or it is deleted after a warning. |
| Privacy | Admins can open user files while it is only the crew. Before sign-up opens that becomes "only with their OK". |
| Money | Kabir pays. Ceiling of $100 a month while income is zero. No paid AI services. Email on a free tier. Charging starts when there is an actual product and costs pass the ceiling. |
| Quality | Tested in Chrome, Safari and iPhone Safari for milestone 1; the rest in 2C. The test bar stays where it is. Losing up to a day of data in a crash is acceptable. When the site is down, alert right away. English first. |
| The look | Speed and clarity win over the 3D look. The vault door stays on every visit, redone. Everything already built stays; anything saved only in the browser moves to the account. |
| Never | A site full of half-baked features. |

## Claude's five changes (accepted by Kabir, 5 Nov)

The fifth change, stem splitting and mastering, is under "Still open for
Kabir" below.

1. **Backups.** You marked them Next. Claude moved them into 1A, because "safe
   and secure" is your own test for milestone 1 and there is no copy of the
   database today. The agent work is done; it needs ten minutes from you in
   Cloudflare and Coolify.
2. **Milestone 1 was 17 items.** Claude split it in two and moved three things
   to 2C: delete my account, download everything, and the audio watermark. They
   matter once strangers arrive, and sign-up stays closed until then.
3. **The vision board had eight things on it.** Notes, pinned songs, images,
   links and the task list are in 1B. Voice memos, drawing and comments moved
   to 2A. A board per song waits for milestone 3, when a Song exists.
4. **Yellow and Clipper.** You said Yellow may keep improving Clipper freely,
   and also that the next month goes to making what exists solid. Yellow builds
   the screens in 1B. Claude suggests milestone 1 comes first and Clipper work
   fills the gaps.

## Still open for Kabir

1. **Stem splitting and mastering. Needs a yes or no before 2B.** You put them
   in milestone 2 and set paid AI to zero. Free tools exist but need a bigger
   server, roughly $15 to $30 more a month. Either allow that, or move them to
   Later.
2. **Staging. Needs Kabir's call. Not on the page.** Milestone 1A lists "a
   staging copy of the site" and 2C says "the live site updates per milestone,
   from staging". But ADR 0005 v2 (PR #66, 2026-10-29, from Swish) removed
   staging, so `main` deploys straight to production. Not resolved here.

## What it costs each month

| Stage | Estimate | Why |
|---|---|---|
| Today | about $7 | One small server. Storage is close to empty. |
| Milestone 1 | $10 to $25 | A staging copy, backups, and the crew's files. Four people filling 200 GB each would be $12 of storage. |
| Milestone 2 | $25 to $60 | Streaming copies roughly double audio storage. Stem splitting on free tools needs a bigger server. |
| After sign-up opens | grows with users | About $0.015 per GB stored. A thousand users with 5 GB each is $75. This is where the free amount and paid tiers matter. |

Estimates from current list prices for the server and storage. Everything stays
under the $100 ceiling until sign-up opens.
