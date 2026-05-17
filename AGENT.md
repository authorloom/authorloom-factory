BookTok Factory — AGENT.md

Mission

Build BookTok Factory: a local-first content automation tool running on a Mac mini.

The purpose of this app is to help generate hundreds of short-form BookTok / romance author videos per month by automating the boring production work.

The app combines:

* background videos
* screenshots
* hooks mapped to screenshots
* campaign caption text
* TikTok/trending audio extracted by the app
* FFmpeg video rendering
* Google Drive campaign folders
* Metricool-ready exports

This is a private internal tool first.

Do not build:

* SaaS features
* user authentication
* subscriptions
* billing
* cloud deployment
* multi-tenant architecture
* unnecessary abstractions

Prioritise:

* local reliability
* speed of workflow
* clean file handling
* obvious UI
* clear logs
* easy debugging
* predictable outputs

⸻

Core Architecture Rule

BOOK = source of truth
CAMPAIGN = combination engine
RENDER JOB = snapshot of combination

⸻

Current repo state

This repo is already a Next.js TypeScript app created with:

* Next.js App Router
* TypeScript
* Tailwind
* ESLint
* src directory
* import alias @/*

Installed npm packages:

* zod
* better-sqlite3
* nanoid
* execa
* p-queue
* react-hook-form
* @hookform/resolvers
* googleapis
* tsx
* @types/better-sqlite3

Installed system dependencies on Mac mini:

* git
* node
* pnpm
* ffmpeg
* sqlite
* imagemagick
* yt-dlp
* VS Code
* Chrome

⸻

Development rules

Use these rules throughout the build:

* Keep everything local-first.
* Do not add auth.
* Do not add SaaS logic.
* Do not add cloud deployment yet.
* Do not add payments.
* Do not use unnecessary architecture ceremony.
* Prefer simple working functionality.
* Use TypeScript strictly.
* Use small clear modules.
* Use predictable file paths.
* Never silently fail.
* Log errors clearly.
* Store job status clearly.
* Make UI acceptance-testable.
* After each ticket, stop and report.

⸻

Sprint 1 — Local MVP

Sprint 1 is complete.

Sprint 1 built a working local content factory that can:

* create campaigns
* upload local backgrounds
* upload local screenshots
* add hooks manually
* add campaign caption
* import audio from a TikTok/source URL
* generate render jobs
* render MP4s with FFmpeg
* export Metricool CSV rows

Do not redo Sprint 1 unless explicitly instructed.

⸻

Sprint 1.5 — Domain Refactor: Book-First Architecture

Goal

Refactor the system from:

Campaign owns all assets

to:

Author → Series → Book → reusable assets
Campaign → selects assets → generates renders

This refactor is required before Google Drive integration.

⸻

Why this refactor matters

The current MVP works, but it stores screenshots, hooks, backgrounds and audio directly against campaigns.

That creates duplication when creating multiple campaigns for the same book.

The new architecture makes books the reusable source of truth.

A book owns:

* screenshots
* hooks
* background videos
* cover
* tropes
* book-level assets

Audio becomes a reusable global library.

Campaigns become lightweight selection records that choose:

* book
* layout
* screenshots/hooks
* backgrounds
* audio

Render jobs remain snapshots of the selected combinations.

⸻

Critical constraints

* Do not remove existing tables yet.
* Do not migrate old data yet unless explicitly instructed.
* Do not break existing render pipeline.
* Do not change FFmpeg layout logic unless required for compatibility.
* Do not start Google Drive integration.
* Keep this as an additive refactor first.
* Execute one ticket at a time.
* Stop after every ticket.

⸻

Target model

New / expanded domain model:

* authors
* series
* books
* book_screenshots
* book_hooks
* book_backgrounds
* book_covers or cover fields on books
* book_tropes
* audio_assets as global reusable audio
* layouts
* campaigns with book_id and layout_id
* campaign_screenshot_selections
* campaign_background_selections
* campaign_audio_selections
* render_jobs
* metricool_rows

⸻

Drive model for later Sprint 2

Google Drive should eventually follow this model:

Book Drive Folder

* source-assets/
    * screenshots/
    * backgrounds/
    * cover/
    * manuscript/
* campaigns/
    * launch-campaign/
        * final-videos/
        * metricool/
    * trope-test-campaign/
        * final-videos/
        * metricool/

Book folder = reusable source of truth.
Campaign folder = output for a specific campaign run.

Do not implement this in Sprint 1.5. This is context for later.

⸻

BF-S1.5-01 — Add Author / Series / Book Tables

Goal

Add the core book-first hierarchy.

Implement

Add new tables in src/lib/db.ts and scripts/init-db.ts if needed.

authors fields:

* id TEXT PRIMARY KEY
* name TEXT NOT NULL
* created_at INTEGER

series fields:

* id TEXT PRIMARY KEY
* author_id TEXT NOT NULL
* name TEXT NOT NULL
* created_at INTEGER

books fields:

* id TEXT PRIMARY KEY
* author_id TEXT NOT NULL
* series_id TEXT nullable
* title TEXT NOT NULL
* description TEXT nullable
* cover_filepath TEXT nullable
* drive_folder_url TEXT nullable
* drive_folder_id TEXT nullable
* created_at INTEGER

Requirements

* Keep schema creation idempotent.
* Do not remove or alter existing campaign tables yet.
* Add useful indexes.
* Existing app must continue to run.

Acceptance criteria

* pnpm db:init passes.
* Running pnpm db:init twice does not fail.
* sqlite3 .tables shows authors, series and books.
* pnpm typecheck passes.
* pnpm lint passes.
* Existing campaign UI still loads.

Stop after this ticket.

⸻

BF-S1.5-02 — Add Book Asset Tables

Goal

Add reusable book-owned asset tables parallel to existing campaign-owned asset tables.

Implement

book_screenshots fields:

* id TEXT PRIMARY KEY
* book_id TEXT NOT NULL
* google_file_id TEXT nullable
* source_url TEXT nullable
* filename TEXT NOT NULL
* filepath TEXT NOT NULL
* created_at INTEGER

book_hooks fields:

* id TEXT PRIMARY KEY
* book_id TEXT NOT NULL
* screenshot_id TEXT NOT NULL
* text TEXT NOT NULL
* source_row_number INTEGER nullable
* created_at INTEGER

book_backgrounds fields:

* id TEXT PRIMARY KEY
* book_id TEXT NOT NULL
* google_file_id TEXT nullable
* filename TEXT NOT NULL
* filepath TEXT NOT NULL
* duration_seconds REAL nullable
* created_at INTEGER

book_tropes fields:

* id TEXT PRIMARY KEY
* book_id TEXT NOT NULL
* trope TEXT NOT NULL
* created_at INTEGER

Requirements

* Keep old background_assets, screenshot_assets and hooks tables untouched.
* Add indexes for book_id and screenshot_id lookups.
* Existing campaign workflow must still work.

Acceptance criteria

* pnpm db:init passes.
* Running pnpm db:init twice does not fail.
* New book asset tables exist.
* Existing campaign render/export flow still compiles.
* pnpm typecheck passes.
* pnpm lint passes.

Stop after this ticket.

⸻

BF-S1.5-03 — Make Audio Global and Reusable

Goal

Decouple audio from campaigns so one audio clip can be reused across many books and campaigns.

Current state

audio_assets currently has nullable campaign_id and is mostly used as campaign-scoped audio.

Desired state

Audio should be global by default.

audio_assets should support:

* id
* title
* source_url nullable
* music_id nullable
* filename
* filepath
* duration_seconds nullable
* notes nullable
* created_at

Implementation guidance

* Do not destroy existing audio rows.
* Do not break existing campaign page yet.
* Keep campaign_id nullable if removing it would be risky.
* Add DB helper functions that can list all audio assets globally.
* Keep existing campaign-scoped list functions temporarily if needed.

Acceptance criteria

* Audio assets can exist without campaign_id.
* Existing imported audio still compiles and renders.
* New DB helper exists for global audio listing.
* pnpm typecheck passes.
* pnpm lint passes.

Stop after this ticket.

⸻

BF-S1.5-04 — Add Layout System

Goal

Prepare for multiple reusable render layouts.

Implement

layouts table fields:

* id TEXT PRIMARY KEY
* name TEXT NOT NULL
* type TEXT NOT NULL
* description TEXT nullable
* created_at INTEGER

Seed default layout:

* id: default_video_layout
* name: Default Video Layout
* type: video
* description: Current vertical video layout using background, screenshot, hook text and audio

Requirements

* Seed idempotently.
* Do not change FFmpeg code yet.
* Layout system exists in DB only for this ticket.

Acceptance criteria

* pnpm db:init creates layouts table.
* default_video_layout exists after db:init.
* Running db:init twice does not duplicate layout.
* pnpm typecheck passes.
* pnpm lint passes.

Stop after this ticket.

⸻

BF-S1.5-05 — Extend Campaign Model

Goal

Allow campaigns to reference a book and a layout.

Implement

Add nullable fields to campaigns:

* book_id TEXT nullable
* layout_id TEXT nullable
* goal TEXT nullable
* drive_campaign_folder_url TEXT nullable
* drive_campaign_folder_id TEXT nullable

Requirements

* Existing campaigns without book_id/layout_id must still load.
* Existing campaign creation must still work.
* Do not require book selection yet.
* Do not change render matrix yet.

Acceptance criteria

* campaigns table has new fields.
* Existing campaigns page still loads.
* Existing campaign workspace still loads.
* pnpm typecheck passes.
* pnpm lint passes.

Stop after this ticket.

⸻

BF-S1.5-06 — Add Campaign Selection Tables

Goal

Create tables that let campaigns select reusable book/audio assets.

Implement

campaign_screenshot_selections fields:

* id TEXT PRIMARY KEY
* campaign_id TEXT NOT NULL
* screenshot_id TEXT NOT NULL
* created_at INTEGER

campaign_background_selections fields:

* id TEXT PRIMARY KEY
* campaign_id TEXT NOT NULL
* background_id TEXT NOT NULL
* created_at INTEGER

campaign_audio_selections fields:

* id TEXT PRIMARY KEY
* campaign_id TEXT NOT NULL
* audio_id TEXT NOT NULL
* created_at INTEGER

Requirements

* Add uniqueness constraints or indexes to avoid duplicate selections.
* Do not change render matrix yet.
* Do not remove campaign-owned asset behaviour yet.

Acceptance criteria

* Selection tables exist.
* Duplicate selections can be prevented by DB or helper functions.
* Existing app still compiles.
* pnpm typecheck passes.
* pnpm lint passes.

Stop after this ticket.

⸻

BF-S1.5-07 — Add Author / Series / Book DB Helpers

Goal

Add DB helper functions for the new domain model.

Implement helper functions in src/lib/db.ts

Authors:

* createAuthor
* listAuthors
* getAuthor

Series:

* createSeries
* listSeries
* listSeriesByAuthor
* getSeries

Books:

* createBook
* listBooks
* getBook
* listBooksByAuthor
* listBooksBySeries
* updateBookDetails if useful

Requirements

* Use existing DB coding style.
* Use nanoid or existing ID pattern.
* Keep functions small and typed.
* Do not build UI yet.

Acceptance criteria

* Helper functions compile.
* Temporary tsx smoke test can create author, series and book.
* pnpm typecheck passes.
* pnpm lint passes.

Stop after this ticket.

⸻

BF-S1.5-08 — Book Management UI

Goal

Create basic UI for authors, series and books.

Routes

Create routes:

* /books
* /books/new
* /books/[bookId]

Optional if simple:

* /authors
* /authors/new
* /series/new

But do not overbuild. A simple book creation form can create/select author and series as text fields if easier for local MVP.

Book creation fields

* author name
* optional series name
* book title
* optional description
* optional tropes as comma-separated text

Book page sections

* Book details
* Tropes
* Cover placeholder
* Screenshots
* Hooks
* Backgrounds
* Related campaigns placeholder

Requirements

* Navigation should include Books.
* Existing Campaigns navigation must remain.
* Do not remove old campaign pages.
* Do not add auth.

Acceptance criteria

* Can create a book.
* Can list books.
* Can open a book page.
* Author and series records are created or selected.
* pnpm typecheck passes.
* pnpm lint passes.

Stop after this ticket.

⸻

BF-S1.5-09 — Book Asset Uploads

Goal

Upload screenshots and backgrounds to books instead of campaigns.

Implement API routes

* /api/books/screenshots/[bookId]
* /api/books/backgrounds/[bookId]

Storage paths

Use:

* storage/screenshots/{bookId}/
* storage/backgrounds/{bookId}/

Behaviour

Reuse existing upload validation:

Background videos:

* mp4
* mov
* m4v
* max 500MB

Screenshots:

* png
* jpg
* jpeg
* webp
* max 25MB

Requirements

* Create book_screenshots rows.
* Create book_backgrounds rows.
* Do not remove old campaign upload routes.
* Book page should list uploaded screenshots and backgrounds.

Acceptance criteria

* Upload screenshot to book works.
* Upload background to book works.
* Files appear under book ID storage folders.
* DB rows are created in book_* tables.
* Book page displays uploaded assets.
* pnpm typecheck passes.
* pnpm lint passes.

Stop after this ticket.

⸻

BF-S1.5-10 — Book Hooks UI

Goal

Attach hooks to book screenshots.

Implement

On book page:

* list screenshots
* for each screenshot, show textarea
* one hook per line
* trim whitespace
* ignore empty lines
* save hooks to book_hooks
* link hook to screenshot_id
* show hook count
* allow deleting hooks

Requirements

* Mirror existing campaign screenshot hook UX.
* Do not remove old campaign hook UX yet.
* Keep DB helpers separate for book_hooks.

Acceptance criteria

* Can add hooks to a book screenshot.
* Hooks persist after reload.
* Hooks are linked to correct book screenshot.
* Hook count displays correctly.
* Can delete book hook.
* pnpm typecheck passes.
* pnpm lint passes.

Stop after this ticket.

⸻

BF-S1.5-11 — Global Audio Library UI

Goal

Create reusable global audio library.

Implement routes

* /audio

Features

* list all audio assets
* import audio by title + source URL
* source video downloads to storage/source-videos/global or similar
* extracted audio saves to storage/audio/global or similar
* create audio_assets row without campaign dependency

Requirements

* Keep old campaign audio import working temporarily if possible.
* Do not require campaign_id for audio import.
* Audio can be reused in campaigns later.
* Do not add trend intelligence yet.

Acceptance criteria

* /audio page loads.
* Can import audio without campaign.
* Audio appears in global list.
* Extracted audio file exists and plays.
* Existing render flow still compiles.
* pnpm typecheck passes.
* pnpm lint passes.

Stop after this ticket.

⸻

BF-S1.5-12 — Campaign Creation Refactor

Goal

Allow campaigns to be created from a book and layout.

New campaign creation flow

Campaign creation should support:

* campaign name
* optional description
* select book
* select layout
* optional goal

Requirements

* Existing campaign creation path can be updated.
* Campaign should save book_id and layout_id.
* If no layout chosen, default to default_video_layout.
* Do not generate render matrix yet from selections in this ticket.
* Existing old campaign records must still load.

Acceptance criteria

* Can create campaign linked to book.
* Campaign page shows linked book and layout.
* Existing campaigns still list.
* pnpm typecheck passes.
* pnpm lint passes.

Stop after this ticket.

⸻

BF-S1.5-13 — Campaign Asset Selection UI

Goal

Campaigns should select reusable book assets and global audio.

Implement on campaign page when campaign has book_id

Sections:

* Select screenshots from linked book
* Select backgrounds from linked book
* Select audio from global audio library

Behaviour

* Multi-select screenshots.
* Multi-select backgrounds.
* Multi-select audio.
* Save selections to campaign_*_selections tables.
* Show selected counts.
* Allow removing selections.

Requirements

* Do not duplicate files.
* Selections reference book_screenshots, book_backgrounds and audio_assets.
* Keep old campaign-owned asset sections visible only for legacy campaigns without book_id, or clearly separate if simpler.

Acceptance criteria

* Can select book screenshots for campaign.
* Can select book backgrounds for campaign.
* Can select global audio for campaign.
* Selections persist after reload.
* No files are duplicated.
* pnpm typecheck passes.
* pnpm lint passes.

Stop after this ticket.

⸻

BF-S1.5-14 — Render Matrix Refactor

Goal

Generate render jobs from selected reusable assets for book-based campaigns.

Current behaviour

Render jobs are generated from campaign-owned:

* background_assets
* screenshot_assets
* hooks
* audio_assets

New behaviour for book-based campaigns

For campaigns with book_id:

* backgrounds come from campaign_background_selections joined to book_backgrounds
* screenshots come from campaign_screenshot_selections joined to book_screenshots
* hooks come from book_hooks linked to selected screenshots
* audio comes from campaign_audio_selections joined to audio_assets

Render job compatibility

Existing render_jobs table currently references:

* background_id
* screenshot_id
* hook_id
* audio_id

Do the smallest safe change.

Preferred approach:

* Add nullable asset_source fields only if needed.
* Or add new render job detail query path for book asset IDs.
* Do not break old campaign render jobs.

Duplicate prevention

For book-based campaigns, prevent duplicate render jobs for:

* campaign_id
* background_id
* screenshot_id
* hook_id
* audio_id

Acceptance criteria

* Book-based campaign matrix preview works.
* Book-based campaign generates render jobs.
* Existing renderer can render book-based jobs.
* Legacy campaign render jobs still compile and load.
* No duplicate jobs created on repeated generation.
* pnpm typecheck passes.
* pnpm lint passes.
* Render one book-based job successfully before stopping.

Stop after this ticket.

⸻

BF-S1.5-15 — Book-Based Metricool Export Compatibility

Goal

Ensure CSV export still works after the book-first refactor.

Requirements

* Export completed render jobs only.
* CSV columns remain only:
    * video_url
    * caption
* Local MVP still uses output filepath.
* Works for book-based campaigns.
* Legacy campaigns still work if possible.

Acceptance criteria

* Completed book-based render jobs export to CSV.
* CSV contains video_url and caption only.
* Captions are preserved.
* pnpm typecheck passes.
* pnpm lint passes.

Stop after this ticket.

⸻

Sprint 1.5 Stop Point

After BF-S1.5-15:

STOP.

Do not start Google Drive.

Report:

* what changed
* what still uses legacy campaign-owned assets
* whether book-based campaigns are fully usable
* whether legacy campaign flow still works
* any recommended cleanup before Sprint 2

⸻

---

# Sprint 1.6 — Book UX Cleanup

## Goal

Clean up the product UX now that Sprint 1.5 introduced the book-first architecture.

Sprint 1.6 should make the app feel like a usable internal production tool before Google Drive integration begins.

The main UX direction is:

- Authors have their own list/detail views.
- Books are editable after creation.
- Book pages become clean dashboards.
- Screenshots and hooks move into dedicated management screens.
- Background videos move into a dedicated management screen.
- Cover and manuscript uploads are supported.
- Audio library supports preview and delete.

Do not start Google Drive integration in this sprint.

---

## Constraints

- Do not remove legacy campaign-owned asset functionality unless explicitly instructed.
- Do not break book-based campaign rendering.
- Do not change FFmpeg layout logic.
- Do not start analytics implementation yet.
- Keep all changes local-first.
- Execute one ticket at a time.
- Stop after every ticket.

---

## BF-S1.6-01 — Authors List and Author Detail UI

### Goal

Add author-level navigation and a clean author detail page.

### Routes

Create:

- /authors
- /authors/[authorId]

### Authors list page

Show:

- author name
- number of books if easy
- link to author detail
- link to create book

### Author detail page

Show:

- author name
- series list
- books by this author
- link to each book
- placeholder section for future analytics
- placeholder section for future campaigns/performance

### Requirements

- Add Authors to main navigation.
- Use existing author DB helpers.
- Do not add analytics logic yet.
- Do not add auth.

### Acceptance criteria

- /authors loads.
- /authors/[authorId] loads.
- Author page shows books for that author.
- Navigation includes Authors.
- pnpm typecheck passes.
- pnpm lint passes.

Stop after this ticket.

---

## BF-S1.6-02 — Book Edit Page

### Goal

Allow existing books to be edited after creation.

### Route

Create:

- /books/[bookId]/edit

### Editable fields

- title
- description
- author
- series
- tropes
- drive_folder_url

### Requirements

- Existing book data should populate the form.
- Saving should update the book.
- Tropes should be editable as comma-separated text.
- Author and series editing should stay simple.
- If changing author/series is complex, support title, description, tropes and drive_folder_url first, then note author/series limitation.
- Add Edit Book link from book detail page.

### Acceptance criteria

- Book edit page loads.
- Can update title.
- Can update description.
- Can update tropes.
- Can update drive_folder_url.
- Book page reflects changes.
- pnpm typecheck passes.
- pnpm lint passes.

Stop after this ticket.

---

## BF-S1.6-03 — Book Cover and Manuscript Uploads

### Goal

Add support for book cover and manuscript uploads.

### Storage paths

Use:

- storage/covers/{bookId}/
- storage/manuscripts/{bookId}/

### Cover support

Allowed cover formats:

- png
- jpg
- jpeg
- webp

Cover behaviour:

- upload cover
- save file locally
- update books.cover_filepath
- show cover preview on book page

### Manuscript support

Allowed manuscript formats:

- pdf
- doc
- docx
- txt

Manuscript behaviour:

- upload manuscript
- save file locally
- store manuscript filepath

### Database

If books table does not yet have manuscript_filepath, add nullable field:

- manuscript_filepath TEXT nullable

### Requirements

- Add API routes or server actions as appropriate.
- Validate file type.
- Use safe filenames.
- Do not parse manuscript yet.
- Do not add AI extraction yet.

### Acceptance criteria

- Can upload book cover.
- Cover preview appears on book page.
- Can upload manuscript.
- Manuscript filename/status appears on book page.
- Files are saved under book-specific storage folders.
- pnpm typecheck passes.
- pnpm lint passes.

Stop after this ticket.

---

## BF-S1.6-04 — Screenshot Management Screens

### Goal

Move screenshot and hook management out of the main book page and into dedicated screens.

### Routes

Create:

- /books/[bookId]/screenshots
- /books/[bookId]/screenshots/[screenshotId]

### Screenshots index page

Show:

- upload screenshot form
- table/list of screenshots
- thumbnail if easy
- filename
- hook count
- link to screenshot detail page

### Screenshot detail page

Show:

- screenshot preview
- hooks list
- add hooks textarea
- delete hook action
- link back to screenshots index
- link back to book page

### Requirements

- Reuse existing book_screenshots and book_hooks logic.
- Do not remove API upload route unless replacing safely.
- Book page should no longer show the full screenshot/hook editing experience.
- Book page should show summary counts and links instead.

### Acceptance criteria

- /books/[bookId]/screenshots loads.
- Can upload screenshot from screenshots page.
- Screenshot detail page loads.
- Can add hooks from screenshot detail page.
- Can delete hooks from screenshot detail page.
- Book page shows screenshot count and hook count summary.
- pnpm typecheck passes.
- pnpm lint passes.

Stop after this ticket.

---

## BF-S1.6-05 — Background Video Management Screen

### Goal

Move background video management out of the main book page and into a dedicated screen.

### Route

Create:

- /books/[bookId]/backgrounds

### Backgrounds page

Show:

- upload background video form
- table/list of uploaded background videos
- filename
- uploaded date
- preview button or inline preview
- link back to book page

### Preview behaviour

Use a basic HTML video player.

It can be:

- inline expanded row, or
- simple modal, or
- separate preview section on the page

Keep it simple.

### Requirements

- Reuse existing book_backgrounds upload route.
- Book page should show background count and link to backgrounds page.
- Do not change rendering behaviour.

### Acceptance criteria

- /books/[bookId]/backgrounds loads.
- Can upload background video from backgrounds page.
- Uploaded videos appear in list/table.
- Can preview a background video.
- Book page shows background count and link.
- pnpm typecheck passes.
- pnpm lint passes.

Stop after this ticket.

---

## BF-S1.6-06 — Simplify Book Detail Page

### Goal

Turn the book detail page into a clean dashboard instead of a long editing page.

### Book page should show

- book title
- author
- series
- description
- cover preview if available
- tropes
- manuscript status
- asset summary cards:
  - screenshots count
  - hooks count
  - background videos count
- campaign summary placeholder
- action links:
  - Edit book
  - Manage screenshots
  - Manage backgrounds
  - Create campaign for this book

### Requirements

- Remove or hide long inline forms from book detail page if they now exist on dedicated screens.
- Keep the page readable and short.
- Do not remove functionality; move it behind links.

### Acceptance criteria

- Book page is significantly shorter and dashboard-like.
- Book page links to edit/screenshots/backgrounds.
- Book page shows correct counts.
- Existing book management still works.
- pnpm typecheck passes.
- pnpm lint passes.

Stop after this ticket.

---

## BF-S1.6-07 — Audio Library Preview and Delete

### Goal

Improve the global audio library so tracks can be previewed and deleted.

### Audio page

On /audio, show each audio asset in a table/list with:

- title
- source URL if available
- filename
- created date
- Preview button/player
- Delete button

### Preview behaviour

Use a basic HTML audio player.

It can be:

- inline player per row, or
- a single selected preview player above the list

Keep it simple.

### Delete behaviour

Deleting an unused audio track should:

- remove the audio_assets DB row
- remove the extracted audio file from storage/audio/global if safe
- remove the source video file from storage/source-videos/global if tracked and safe

Protection rule:

- If an audio track is referenced by render_jobs or campaign_audio_selections, do not hard-delete silently.
- Prefer blocking deletion with a clear error message for now.
- Do not implement complex soft-delete unless very simple.

### Requirements

- Add DB helper to check audio references.
- Add DB helper/action to delete unused audio.
- Add UI feedback for blocked deletion.
- Keep campaign rendering safe.

### Acceptance criteria

- Can preview audio from /audio.
- Can delete unused audio.
- Referenced audio cannot be accidentally deleted.
- Clear message shown when deletion is blocked.
- pnpm typecheck passes.
- pnpm lint passes.

Stop after this ticket.

---

## BF-S1.6-08 — Campaign UX Sanity Pass

### Goal

Make sure campaign pages still make sense after the book UX cleanup.

### Requirements

For book-based campaigns, campaign page should clearly show:

- campaign name
- linked book
- linked layout
- selected screenshots count
- selected backgrounds count
- selected audio count
- render matrix preview
- render jobs
- export panel

For legacy campaigns, keep existing sections available.

### Acceptance criteria

- Book-based campaign page is understandable.
- Legacy campaign page still loads.
- Render matrix still works.
- Render pending jobs still works.
- Export still works.
- pnpm typecheck passes.
- pnpm lint passes.

Stop after this ticket.

---

## Sprint 1.6 Stop Point

After BF-S1.6-08:

STOP.

Do not start Google Drive.

Report:

- whether author/book UX is now usable
- whether book-based campaigns still render
- whether audio preview/delete works
- whether any legacy campaign cleanup is recommended before Sprint 2

_______

# Sprint 1.7 — Campaign Batch Refactor

## Goal

Refactor campaigns so they become long-lived campaign containers, while each production run becomes a render batch / sub-campaign.

New hierarchy:

Book
→ Campaign
  → Render Batch
    → selected screenshots
    → selected hooks
    → selected backgrounds
    → selected audio
    → caption
    → render jobs

This solves the current problem where selections live directly on the campaign and become messy when adding more content over time.

---

## Core Rule

CAMPAIGN = output container and strategy  
RENDER BATCH = one production run / sub-campaign  
RENDER JOB = one final video combination

---

## Constraints

- Do not remove legacy campaign-owned functionality yet.
- Do not break existing book-based campaign rendering.
- Do not change FFmpeg layout logic.
- Do not start Google Drive integration yet.
- Keep Metricool CSV columns as video_url,caption.
- Keep implementation local-first.
- Execute one ticket at a time.
- Stop after every ticket.

---

## Target Model

Add:

render_batches

Fields:

- id TEXT PRIMARY KEY
- campaign_id TEXT NOT NULL
- name TEXT NOT NULL
- layout_id TEXT nullable
- caption TEXT nullable
- status TEXT NOT NULL DEFAULT pending
- created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
- updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP

Allowed batch statuses:

- draft
- pending
- rendering
- done
- failed

Add:

render_batch_screenshot_selections

Fields:

- id TEXT PRIMARY KEY
- batch_id TEXT NOT NULL
- screenshot_id TEXT NOT NULL
- created_at INTEGER

render_batch_hook_selections

Fields:

- id TEXT PRIMARY KEY
- batch_id TEXT NOT NULL
- hook_id TEXT NOT NULL
- created_at INTEGER

render_batch_background_selections

Fields:

- id TEXT PRIMARY KEY
- batch_id TEXT NOT NULL
- background_id TEXT NOT NULL
- created_at INTEGER

render_batch_audio_selections

Fields:

- id TEXT PRIMARY KEY
- batch_id TEXT NOT NULL
- audio_id TEXT NOT NULL
- created_at INTEGER

Add nullable field to render_jobs:

- batch_id TEXT nullable

---

## Desired UX

Campaign page should become a dashboard:

- campaign details
- linked book
- linked layout
- campaign Drive folder placeholder/field later
- summary cards
- render batches table
- create render batch button
- render jobs summary
- export panel

Render batch creation should be a dedicated route, not a modal for now:

- /campaigns/[campaignId]/batches/new
- /campaigns/[campaignId]/batches/[batchId]

The batch creation flow should allow:

- name batch
- choose layout
- choose screenshots
- choose hooks for selected screenshots
- choose backgrounds
- choose audio
- add/override caption
- preview render count
- add batch to queue / create jobs

---

## BF-S1.7-01 — Add Render Batch Tables

### Goal

Add render_batches and render batch selection tables.

### Implement

Create tables:

render_batches

Fields:

- id TEXT PRIMARY KEY
- campaign_id TEXT NOT NULL
- name TEXT NOT NULL
- layout_id TEXT nullable
- caption TEXT nullable
- status TEXT NOT NULL DEFAULT draft
- created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
- updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP

render_batch_screenshot_selections

Fields:

- id TEXT PRIMARY KEY
- batch_id TEXT NOT NULL
- screenshot_id TEXT NOT NULL
- created_at INTEGER

render_batch_hook_selections

Fields:

- id TEXT PRIMARY KEY
- batch_id TEXT NOT NULL
- hook_id TEXT NOT NULL
- created_at INTEGER

render_batch_background_selections

Fields:

- id TEXT PRIMARY KEY
- batch_id TEXT NOT NULL
- background_id TEXT NOT NULL
- created_at INTEGER

render_batch_audio_selections

Fields:

- id TEXT PRIMARY KEY
- batch_id TEXT NOT NULL
- audio_id TEXT NOT NULL
- created_at INTEGER

Add nullable render_jobs.batch_id.

### Requirements

- Add useful indexes.
- Add uniqueness indexes to prevent duplicate selections per batch.
- Do not remove campaign-level selection tables yet.
- Do not change existing render generation yet.

### Acceptance criteria

- pnpm db:init passes.
- Running db:init twice does not fail.
- New tables exist.
- render_jobs has batch_id.
- Existing campaign page still loads.
- pnpm typecheck passes.
- pnpm lint passes.

Stop after this ticket.

---

## BF-S1.7-02 — Add Render Batch DB Helpers

### Goal

Add typed DB helpers for render batches and batch selections.

### Implement helpers

Render batches:

- createRenderBatch
- getRenderBatch
- listRenderBatchesByCampaign
- updateRenderBatch
- updateRenderBatchStatus

Batch selections:

- listRenderBatchScreenshotSelections
- listRenderBatchHookSelections
- listRenderBatchBackgroundSelections
- listRenderBatchAudioSelections
- updateRenderBatchScreenshotSelections
- updateRenderBatchHookSelections
- updateRenderBatchBackgroundSelections
- updateRenderBatchAudioSelections

### Validation rules

- Batch must belong to campaign.
- Campaign must be book-based for book asset selection.
- Selected screenshots/backgrounds must belong to the campaign’s linked book.
- Selected hooks must belong to selected screenshots.
- Selected audio must exist globally.
- Deduplicate selected IDs.

### Requirements

- Keep existing campaign selection helpers unchanged.
- Do not build UI yet.
- Do not alter render matrix yet.

### Acceptance criteria

- DB helpers compile.
- Smoke test can create batch and save selections.
- Invalid asset selection is rejected.
- pnpm typecheck passes.
- pnpm lint passes.

Stop after this ticket.

---

## BF-S1.7-03 — Add Render Batch Routes

### Goal

Create basic batch pages.

### Routes

Create:

- /campaigns/[campaignId]/batches/new
- /campaigns/[campaignId]/batches/[batchId]

### New batch page

Show form fields:

- batch name
- layout select
- caption textarea

Also show:

- linked campaign name
- linked book
- explanatory text that asset selection comes next

For this ticket, create only the batch record and redirect to the batch detail page.

### Batch detail page

Show:

- batch name
- status
- linked campaign
- linked book
- layout
- caption
- placeholder sections for screenshots, hooks, backgrounds, audio, render jobs

### Acceptance criteria

- Can open new batch page.
- Can create render batch.
- Can open batch detail page.
- Campaign must exist.
- Book-based campaign required for now.
- pnpm typecheck passes.
- pnpm lint passes.

Stop after this ticket.

---

## BF-S1.7-04 — Batch Asset Selection UI

### Goal

Allow selecting screenshots, hooks, backgrounds and audio for a batch.

### On batch detail page

Add selection sections:

Screenshots:

- list book screenshots
- checkbox select screenshots
- save selected screenshots

Hooks:

- after screenshots are selected, show hooks grouped by selected screenshot
- checkbox select hooks
- save selected hooks

Backgrounds:

- list book backgrounds
- checkbox select backgrounds
- include filename
- include preview link or small video preview if easy
- save selected backgrounds

Audio:

- list global audio assets
- checkbox select audio
- include title
- include preview link/player if easy
- save selected audio

### Requirements

- Save to render_batch_*_selections tables.
- Show selected counts.
- Do not duplicate files.
- Keep old campaign selection UI untouched for now.

### Acceptance criteria

- Can select screenshots for batch.
- Can select hooks for batch.
- Can select backgrounds for batch.
- Can select audio for batch.
- Selections persist after reload.
- Invalid hooks not belonging to selected screenshots are not allowed.
- pnpm typecheck passes.
- pnpm lint passes.

Stop after this ticket.

---

## BF-S1.7-05 — Batch Render Matrix Preview

### Goal

Show render matrix preview for a batch.

### Matrix formula

selected backgrounds × selected hooks × selected audio

If no audio selected:

selected backgrounds × selected hooks × no-audio

### On batch detail page show cards

- selected screenshots count
- selected hooks count
- selected backgrounds count
- selected audio count
- preview render count

### Requirements

- Add DB helper getRenderBatchMatrixStats.
- Do not generate jobs yet.
- Use selected hooks, not all hooks for selected screenshots.

### Acceptance criteria

- Preview count is correct.
- If 2 backgrounds, 4 selected hooks, 3 audio = 24.
- If 2 backgrounds, 4 hooks, 0 audio = 8.
- pnpm typecheck passes.
- pnpm lint passes.

Stop after this ticket.

---

## BF-S1.7-06 — Generate Render Jobs From Batch

### Goal

Generate render jobs from a render batch.

### Implement

Add helper:

- generateRenderJobsForBatch(batchId)

For the batch:

- load campaign
- load batch selections
- generate jobs from selected backgrounds × selected hooks × selected audio
- if no audio selected, generate no-audio jobs
- set render_jobs.batch_id
- set background_source = book
- set screenshot_source = book
- set hook_source = book
- caption = hook text + blank line + batch.caption if batch caption exists, otherwise campaign.default_caption

### Duplicate prevention

Duplicate key should effectively be:

- batch_id
- background_id
- screenshot_id
- hook_id
- audio_id

Important:

Existing unique index is campaign-wide. If needed, add new unique index using batch_id and asset IDs while preserving legacy behaviour.

### UI

Add button on batch detail:

- Generate batch jobs

### Acceptance criteria

- Can generate jobs for a batch.
- Generated jobs have batch_id.
- Re-running generation skips duplicates.
- Existing campaign-level generation still compiles.
- pnpm typecheck passes.
- pnpm lint passes.

Stop after this ticket.

---

## BF-S1.7-07 — Render Batch Jobs

### Goal

Allow rendering jobs at batch level.

### Implement

On batch detail page:

- list render jobs for this batch
- status counts for this batch
- button Render pending batch jobs
- button Retry failed batch jobs

Add helpers/actions if needed:

- listRenderJobsByBatch
- renderPendingBatchJobsAction
- retryFailedBatchJobsAction

### Requirements

- Keep campaign-level rendering still working.
- Use existing renderJob(jobId).
- Rendering a batch should only render jobs for that batch.

### Acceptance criteria

- Batch job list loads.
- Render pending batch jobs works.
- Retry failed batch jobs works.
- Rendered MP4s are still written locally.
- Book-based batch render succeeds for one real job.
- pnpm typecheck passes.
- pnpm lint passes.

Stop after this ticket.

---

## BF-S1.7-08 — Refactor Campaign Page Into Batch Dashboard

### Goal

Simplify the campaign page so it is no longer a giant asset-selection page.

### Campaign page should show

- campaign details
- linked book
- linked layout
- goal
- summary cards:
  - batches count
  - total render jobs
  - completed render jobs
  - failed render jobs
- render batches table:
  - batch name
  - status
  - created date
  - selected/render count if easy
  - link to batch
- create render batch button
- campaign-level render jobs summary
- export panel

### Requirements

- Move book-based asset selection away from campaign page.
- Keep legacy campaign asset sections only for legacy campaigns without book_id.
- For book-based campaigns, show batch dashboard only.
- Do not remove legacy campaign flow yet.

### Acceptance criteria

- Book-based campaign page is shorter and understandable.
- Can navigate to create batch.
- Can open existing batch.
- Legacy campaign page still loads.
- pnpm typecheck passes.
- pnpm lint passes.

Stop after this ticket.

---

## BF-S1.7-09 — Campaign and Batch Export Compatibility

### Goal

Ensure exports still work after batch refactor.

### Campaign export behaviour

Campaign export should still export all completed jobs in the campaign.

### Batch export behaviour

Add batch export if simple:

- export completed jobs for one batch only
- save to storage/exports/{campaignId}/batch-{batchId}-metricool-export-{timestamp}.csv

If batch export adds too much complexity, skip it and report.

### Requirements

- CSV columns remain only:
  - video_url
  - caption
- Local MVP still uses output filepath.
- Existing campaign export still works.

### Acceptance criteria

- Campaign-level CSV export still works.
- Completed batch jobs appear in campaign export.
- If implemented, batch CSV export works.
- pnpm typecheck passes.
- pnpm lint passes.

Stop after this ticket.

---

## BF-S1.7-10 — Campaign Drive Folder Fields

### Goal

Restore campaign folder fields so Sprint 2 can upload outputs into campaign-specific Drive folders.

### Campaign creation/edit support

Campaign should support:

- drive_campaign_folder_url
- drive_campaign_folder_id later
- optional drive_folder_url legacy field only if needed

### Requirements

- Add field to campaign creation form:
  - Campaign Drive Folder URL
- Save to campaigns.drive_campaign_folder_url.
- Show it on campaign page.
- Do not implement Drive upload yet.

### Acceptance criteria

- Can create campaign with campaign Drive folder URL.
- URL displays on campaign page.
- Existing campaigns still load.
- pnpm typecheck passes.
- pnpm lint passes.

Stop after this ticket.

---

## Sprint 1.7 Stop Point

After BF-S1.7-10:

STOP.

Do not start Google Drive.

Report:

- whether batch-based campaign workflow is usable
- whether legacy campaign workflow still works
- whether batch render jobs render correctly
- whether campaign export still includes batch jobs
- what should be cleaned up before Sprint 2

_______


# Sprint 2 — Google Drive Integration

## Goal

Make Google Drive the source and destination for book and campaign assets.

The book Drive folder should become the reusable source of truth for book-level assets.

The campaign Drive folder should become the output destination for rendered videos and Metricool CSV files.

---

## Core Drive Model

Book Drive Folder
- source-assets/
  - screenshots/
  - backgrounds/
  - cover/
  - manuscript/
  - hooks.csv or hooks Google Sheet link/reference later
- campaigns/
  - campaign-name/
    - final-videos/
    - metricool/

Book folder = reusable source assets.  
Campaign folder = output folder for rendered campaign/batch assets.

---

## Current Local Model To Preserve

Books own:

- cover
- manuscript
- screenshots
- hooks
- backgrounds
- tropes

Campaigns own:

- campaign strategy
- linked book
- linked layout
- campaign Drive folder
- render batches

Render batches own:

- selected screenshots
- selected hooks
- selected backgrounds
- selected audio
- generated render jobs

Render jobs own:

- output filepath
- Drive file ID
- Drive URL

Metricool export columns remain:

- video_url
- caption

---

## Important Constraints

- Do not break local-first workflow.
- Google Drive integration should be optional.
- If Google credentials are missing, local app must still work.
- Do not start Metricool API integration.
- Do not add SaaS/auth/multi-tenant logic.
- Do not change FFmpeg rendering logic.
- Do not change CSV columns.
- Keep all Drive errors clear and visible.
- Execute one ticket at a time.
- Stop after every ticket.

---

## Required Google Setup

Use Google Drive API.

Use Google Sheets API only when required for hooks import later.

The app should support local Google authentication suitable for an internal Mac mini tool.

Use the installed googleapis package if available. If it is missing, install/add it cleanly.

---

## BF-S2-01 — Google API Environment and Client

### Goal

Add Google API configuration and a reusable Drive client.

### Implement

Create:

- src/lib/google.ts or src/lib/drive.ts

Add environment support in:

- src/lib/env.ts
- .env.local.example

Suggested env vars:

- GOOGLE_CLIENT_EMAIL
- GOOGLE_PRIVATE_KEY
- GOOGLE_PROJECT_ID
- GOOGLE_DRIVE_ROOT_FOLDER_ID optional
- GOOGLE_APPLICATION_CREDENTIALS optional if using service account JSON file

Preferred local-first approach:

- Support service account credentials via env vars.
- Also allow GOOGLE_APPLICATION_CREDENTIALS file path if straightforward.
- Do not require credentials for local app startup.
- Only require credentials when a Drive action is executed.

### Drive helpers

Implement helpers:

- getDriveClient
- assertGoogleDriveConfigured
- extractDriveIdFromUrl
- getDriveFile
- listDriveFolderChildren
- findDriveChildByName
- createDriveFolder
- downloadDriveFile
- uploadFileToDrive
- setDriveFileReadableByLink if needed
- getDriveWebViewLink or getDriveWebContentLink

### Requirements

- Keep helpers small and typed.
- All Google errors should be wrapped in useful messages.
- Do not call Drive from page render yet.
- Do not implement sync yet.

### Acceptance criteria

- pnpm typecheck passes.
- pnpm lint passes.
- pnpm build passes.
- extractDriveIdFromUrl works for common Drive folder/file URLs.
- Missing Google credentials produce a clear error only when Drive helper is used.
- Local app still starts without Google credentials.

Stop after this ticket.

---

## BF-S2-02 — Book Drive Folder Metadata Sync

### Goal

Allow a book to store and validate its Drive folder.

### UI

On book edit page:

- drive_folder_url already exists or should be shown.
- Add a “Check Drive folder” or “Sync folder metadata” action.

### Behaviour

When user enters a book Drive folder URL:

- extract folder ID
- call Drive API
- verify folder exists
- store books.drive_folder_id
- keep books.drive_folder_url
- show folder name if easy
- show clear error if missing/inaccessible

### Requirements

- Do not download files yet.
- Do not create subfolders yet.
- Do not require Drive if URL is empty.

### Acceptance criteria

- Book can save Drive folder URL.
- Sync action extracts and stores drive_folder_id.
- Clear error if Drive credentials are missing.
- Clear error if folder cannot be accessed.
- Existing book edit flow still works.
- pnpm typecheck passes.
- pnpm lint passes.
- pnpm build passes.

Stop after this ticket.

---

## BF-S2-03 — Discover Book Drive Folder Structure

### Goal

Inspect the expected book Drive folder structure and report what exists/missing.

Expected structure:

Book Drive Folder
- source-assets/
  - screenshots/
  - backgrounds/
  - cover/
  - manuscript/
- campaigns/

### Implement

Create Drive discovery helper:

- inspectBookDriveFolder(bookId)

It should:

- load book
- require book.drive_folder_id or extract from URL
- list children of book folder
- find source-assets
- find screenshots
- find backgrounds
- find cover
- find manuscript
- find campaigns
- return structured result with found/missing folder IDs

### UI

On book page or edit page, show a Drive structure/status panel:

- Book Drive folder connected / not connected
- source-assets found/missing
- screenshots found/missing
- backgrounds found/missing
- cover found/missing
- manuscript found/missing
- campaigns found/missing

### Requirements

- Do not download files yet.
- Do not auto-create folders yet unless explicitly safe.
- Keep result readable.

### Acceptance criteria

- Drive structure panel appears for books with Drive folder URL/ID.
- Missing folders are clearly shown.
- Existing local book workflow still works without Drive.
- pnpm typecheck passes.
- pnpm lint passes.
- pnpm build passes.

Stop after this ticket.

---

## BF-S2-04 — Import Book Screenshots From Drive

### Goal

Download screenshots from the book Drive folder into the book asset library.

### Source

Book Drive Folder/source-assets/screenshots/

### Behaviour

For each image file:

- check file type png/jpg/jpeg/webp
- skip unsupported files
- download locally to storage/screenshots/{bookId}/
- create book_screenshots row
- store google_file_id
- store source_url or Drive webViewLink if available
- avoid duplicate downloads using google_file_id
- show import summary:
  - downloaded
  - skipped duplicates
  - skipped unsupported
  - errors

### UI

Add action on book screenshots page or book Drive panel:

- Import screenshots from Drive

### Acceptance criteria

- Imports supported screenshots from Drive.
- Files saved locally.
- book_screenshots rows created.
- google_file_id stored.
- Re-running import does not duplicate.
- Unsupported files are skipped and reported.
- pnpm typecheck passes.
- pnpm lint passes.
- pnpm build passes.

Stop after this ticket.

---

## BF-S2-05 — Import Book Background Videos From Drive

### Goal

Download background videos from the book Drive folder into the book asset library.

### Source

Book Drive Folder/source-assets/backgrounds/

### Behaviour

For each video file:

- supported formats: mp4, mov, m4v
- skip unsupported files
- download locally to storage/backgrounds/{bookId}/
- create book_backgrounds row
- store google_file_id
- avoid duplicate downloads using google_file_id
- duration_seconds can remain null unless easy to calculate
- show import summary:
  - downloaded
  - skipped duplicates
  - skipped unsupported
  - errors

### UI

Add action on book backgrounds page or book Drive panel:

- Import backgrounds from Drive

### Acceptance criteria

- Imports supported background videos from Drive.
- Files saved locally.
- book_backgrounds rows created.
- google_file_id stored.
- Re-running import does not duplicate.
- Existing local upload still works.
- pnpm typecheck passes.
- pnpm lint passes.
- pnpm build passes.

Stop after this ticket.

---

## BF-S2-06 — Import Book Cover and Manuscript From Drive

### Goal

Import cover and manuscript files from Drive source-assets folders.

### Sources

Book Drive Folder/source-assets/cover/  
Book Drive Folder/source-assets/manuscript/

### Cover behaviour

- Accept png, jpg, jpeg, webp.
- If multiple cover files exist, use the first supported file sorted by name or modified time.
- Download to storage/covers/{bookId}/.
- update books.cover_filepath.

### Manuscript behaviour

- Accept pdf, doc, docx, txt.
- If multiple manuscript files exist, use the first supported file sorted by name or modified time.
- Download to storage/manuscripts/{bookId}/.
- update books.manuscript_filepath.

### UI

Add action:

- Import cover/manuscript from Drive

### Acceptance criteria

- Cover imports and appears on book page.
- Manuscript imports and appears on book page.
- Existing local upload still works.
- Re-running does not create confusing duplicates.
- pnpm typecheck passes.
- pnpm lint passes.
- pnpm build passes.

Stop after this ticket.

---

## BF-S2-07 — Hooks CSV Import From Drive

### Goal

Import hooks for book screenshots from a CSV file stored in Drive.

### Source

Support either:

- Book Drive Folder/source-assets/hooks.csv
- or a user-entered CSV/Sheet URL later

For this ticket, start with hooks.csv in the book Drive folder if present.

Required CSV columns:

- hook
- screenshot_url

### Behaviour

- Download hooks.csv from Drive.
- Parse CSV.
- Extract Google Drive file ID from screenshot_url.
- Match to book_screenshots.google_file_id.
- Create book_hooks linked to matched screenshot.
- Store source_row_number if useful.
- Trim hook text.
- Ignore empty rows.
- Avoid duplicate hook imports where practical.
- Show unmatched rows clearly.

### Requirements

- Do not use AI.
- Do not parse manuscript.
- Keep CSV parser simple and robust enough for quoted commas/newlines if practical.
- If a package is needed, add it cleanly; otherwise implement minimal parser carefully.

### Acceptance criteria

- hooks.csv imports.
- Hooks link to correct screenshot using google_file_id.
- Unmatched rows are reported.
- Duplicate import does not create duplicates if possible.
- Existing manual hook management still works.
- pnpm typecheck passes.
- pnpm lint passes.
- pnpm build passes.

Stop after this ticket.

---

## BF-S2-08 — Campaign Drive Folder Metadata Sync

### Goal

Allow a campaign to store and validate its campaign Drive output folder.

### UI

Campaign creation/edit should support:

- drive_campaign_folder_url

Campaign page should show:

- drive_campaign_folder_url
- drive_campaign_folder_id if synced
- Drive folder status

### Behaviour

Sync action:

- extract folder ID from drive_campaign_folder_url
- verify folder exists
- store campaigns.drive_campaign_folder_id
- show clear errors

### Requirements

- Do not upload renders yet.
- Do not create folders yet unless explicitly requested.
- Existing campaign creation still works without Drive URL.

### Acceptance criteria

- Can create campaign with Drive folder URL.
- Can sync and store drive_campaign_folder_id.
- Campaign page shows Drive status.
- Clear errors for missing credentials/folder access.
- pnpm typecheck passes.
- pnpm lint passes.
- pnpm build passes.

Stop after this ticket.

---

## BF-S2-09 — Ensure Campaign Drive Output Structure

### Goal

Ensure the campaign Drive folder has expected output folders.

Expected campaign folder:

Campaign Drive Folder
- final-videos/
- metricool/

### Behaviour

Add helper:

- ensureCampaignDriveOutputFolders(campaignId)

It should:

- load campaign
- require drive_campaign_folder_id
- find final-videos folder or create it
- find metricool folder or create it
- return folder IDs

### UI

Add action on campaign page:

- Prepare Drive output folders

### Requirements

- Do not upload files yet.
- Store folder IDs only if adding DB fields is clean; otherwise return/display them.
- If DB fields are useful, add:
  - campaigns.drive_final_videos_folder_id nullable
  - campaigns.drive_metricool_folder_id nullable

### Acceptance criteria

- final-videos folder is found or created.
- metricool folder is found or created.
- IDs are shown or stored.
- Re-running action is idempotent.
- pnpm typecheck passes.
- pnpm lint passes.
- pnpm build passes.

Stop after this ticket.

---

## BF-S2-10 — Upload Rendered Videos To Drive

### Goal

Upload completed rendered MP4s to campaign Drive final-videos folder.

### Behaviour

For completed render jobs:

- if output_filepath exists
- if drive_file_id is empty
- upload MP4 to campaign final-videos Drive folder
- set file readable by link if needed
- store render_jobs.drive_file_id
- store render_jobs.drive_url
- skip already uploaded jobs
- show summary:
  - uploaded
  - skipped already uploaded
  - failed

### Scope

Implement campaign-level upload first:

- Upload completed campaign videos

Batch-level upload can be added if simple:

- Upload completed batch videos

### Requirements

- Do not re-render videos.
- Do not change local output files.
- Use stable filenames, ideally existing output_filename.
- Clear error if campaign Drive folder is missing.

### Acceptance criteria

- Completed videos upload to Drive.
- Drive file ID and URL saved on render_jobs.
- Re-running does not duplicate uploaded videos.
- Campaign page shows upload summary/status.
- Metricool export can later use drive_url.
- pnpm typecheck passes.
- pnpm lint passes.
- pnpm build passes.

Stop after this ticket.

---

## BF-S2-11 — Metricool CSV Uses Drive URLs When Available

### Goal

Update Metricool export so Drive URLs are used when available.

### Behaviour

CSV video_url should use:

1. render_jobs.drive_url if present
2. otherwise render_jobs.output_filepath

Columns remain:

- video_url
- caption

### Requirements

- Campaign export should include all completed jobs by campaign_id.
- Batch export should include completed jobs by batch_id.
- Do not add extra columns.

### Acceptance criteria

- CSV uses Drive URL for uploaded videos.
- CSV falls back to local output filepath if Drive URL missing.
- Campaign export still works.
- Batch export still works.
- CSV header remains video_url,caption.
- pnpm typecheck passes.
- pnpm lint passes.
- pnpm build passes.

Stop after this ticket.

---

## BF-S2-12 — Upload Metricool CSV To Drive

### Goal

Upload generated Metricool CSV files to the campaign Drive metricool folder.

### Behaviour

After creating CSV:

- upload local CSV to campaign metricool Drive folder
- use campaign or batch export filename
- make readable by link if needed
- show Drive link in UI if simple

### Scope

Implement campaign CSV upload first.

Batch CSV upload can be added if simple.

### Requirements

- Do not change CSV columns.
- Keep local CSV generation.
- Re-running export/upload should not break.
- Clear errors if Drive folders are not prepared.

### Acceptance criteria

- Metricool CSV uploads to Drive metricool folder.
- Local CSV still exists.
- Drive CSV URL shown if implemented.
- pnpm typecheck passes.
- pnpm lint passes.
- pnpm build passes.

Stop after this ticket.

---

## BF-S2-13 — Full Drive Workflow Smoke Test

### Goal

Verify the complete Drive-enabled flow.

### Test flow

Using a test Drive book folder:

1. Create or edit book with Drive folder URL.
2. Sync book folder metadata.
3. Import screenshots.
4. Import backgrounds.
5. Import cover/manuscript if present.
6. Import hooks.csv if present.
7. Create campaign with campaign Drive folder URL.
8. Sync campaign folder metadata.
9. Prepare final-videos and metricool folders.
10. Create render batch.
11. Select imported assets.
12. Generate jobs.
13. Render jobs.
14. Upload videos to Drive.
15. Export Metricool CSV using Drive URLs.
16. Upload Metricool CSV to Drive.

### Requirements

- Do not use production folders for smoke test unless user explicitly does.
- Report any manual setup needed.
- Keep clear logs/errors.

### Acceptance criteria

- Full Drive workflow works end-to-end or failures are clearly explained.
- Local-only workflow still works.
- pnpm typecheck passes.
- pnpm lint passes.
- pnpm build passes.

Stop after this ticket.

---

## Sprint 2 Stop Point

After BF-S2-13:

STOP.

Report:

- whether Drive import works for book assets
- whether Drive upload works for rendered videos
- whether Metricool CSV uses Drive URLs
- whether Metricool CSV uploads to Drive
- any remaining Drive setup pain
- what should happen next before Metricool API / analytics

⸻

Sprint 3 — Trend intelligence

Only start Sprint 3 after Sprint 1.5 and Sprint 2 are working.

Sprint 3 goal:

Help choose better audio, hashtags, captions, and creative direction.

⸻

Execution instructions for Codex

Always follow this process:

1. Read this AGENT.md fully.
2. Work on only the instructed ticket.
3. Do not jump ahead.
4. Implement the smallest complete working version.
5. Run relevant checks.
6. Report:
    * files changed
    * commands run
    * acceptance criteria result
    * any errors
7. Stop and wait for next instruction.

Immediate starting ticket:

BF-S1.7-01

Do not start BF-S1.7-02 until explicitly instructed.
