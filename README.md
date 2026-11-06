# CjayTasks

**Daily Task Planner** — a focused, installable task manager for planning and completing your day.

CjayTasks is a single-page web app (PWA) built by a PharmD student for his own daily planning: add tasks, see what is due today and what's coming up, and watch a completion ring fill as the day gets done. It works offline, installs on your phone like a native app, and keeps your data on your device.

## Features

- **Add, edit and complete tasks** — quick add via the floating `+` button; tasks are edited in a modal. Each task has a title, optional notes, a due date (new tasks default to today), a priority, a category, and an optional recurrence.
- **Priorities** — Low, Medium, or High, shown on each task and usable as a filter.
- **Categories** — free-form categories you create by using them on a task; filter the list by category.
- **Recurring tasks** — repeat Daily, Weekly, or Monthly; completed recurring tasks roll forward to their next date.
- **Three views** — List (everything active), Today (due today), and Upcoming (due in the next 7 days), switched from a segmented control.
- **Completion ring** — a live progress ring for today's tasks only, with a percentage and a short status message (e.g. "All clear" when nothing is due, "All done for today 🎉" when everything due today is finished).
- **Search and filter** — find tasks by title, category, or notes, and filter by category, priority, and completion, with sorting by due date, priority, newest first, or manual (as added).
- **Calendar** — a month view of tasks; tap a day to see that day's tasks.
- **History** — completed tasks for This Week, This Month, or All Time, newest first.
- **Reports** — counts of active tasks, tasks done this week, and tasks done all-time; the CSV and `.ics` exports live here too.
- **Semester progress tracker** — set your semester start and end dates in Settings and see a progress bar showing how far through the semester you are.
- **Settings** — app options live in the Settings menu, including theme and semester dates.
- **Custom date picker** — pick a due date from a small calendar popup, with quick "Today" / "Tomorrow" / "Clear" shortcuts.
- **Google Drive sync** — optional push/pull backup to a Drive folder, using your own Google OAuth Client ID.
- **Cloud sync and push notifications** — optional sync through a Cloudflare Worker (sync token in Settings); changes sync automatically a couple of seconds after you edit, and again whenever the tab regains focus. Push notifications for tasks use the service worker with a VAPID key from the worker.
- **Add tasks from Telegram** — tasks created elsewhere (e.g. via Telegram) sync into the app through the same Cloudflare Worker; synced-in tasks are marked with a Telegram badge.
- **Export** — export tasks to CSV, or to a `.ics` calendar file to use in another calendar app. There is no import: tasks can only be added in the app, via sync, or restored from Drive.
- **Light and dark themes** — toggle from the top bar; your choice is remembered.
- **Offline-first** — a service worker caches the app so it loads and works without internet; an offline banner explains that changes save locally and sync when you're back online.
- **View-only mode** — opening the app with `?view=1` (or `?readonly=1`) in the URL disables editing and shows a "View Only" badge.
- **Clear all data** — a danger-zone button in Settings wipes all local tasks (cannot be undone).
- **Installable (PWA)** — add it to your home screen; it opens standalone in portrait with its own icon and purple (`#7B5EA7`) theme colour.

## How to use

1. Open `index.html` in a browser.
2. Tap the **+** button to add a task and give it a due date.
3. Switch between **List**, **Today** and **Upcoming** to see what needs doing.
4. Tick tasks off as you finish them and watch the completion ring fill.
5. Use the menu (☰) for **Search**, **Calendar**, **History**, **Reports** and **Settings**.
6. To install it on your phone, use your browser's "Add to Home Screen" option.

No account, build step or installation is needed — it is plain HTML, CSS and JavaScript. Just open `index.html` (or serve the folder with any static file server) and it runs.

## Tech stack

- Plain HTML, CSS and JavaScript — no framework, no build step.
- [Font Awesome 6.5.0](https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css) icons (CDN).
- Google Fonts: Sora (headings) and IBM Plex Sans (body).
- Google Identity Services + Google API client libraries are loaded for Google Drive sync.
- Service Worker (`sw.js`, cache version `v2.0.1`) with stale-while-revalidate caching for the app, cache-first for fonts/icons, and push-notification handling.
- Web App Manifest (`manifest.json`) — standalone display, portrait orientation.

## Project structure

```
CjayTasks/
├── index.html    # App shell: top bar, hero ring, views, modals, date picker
├── app.js        # All app logic (~70 KB)
├── styles.css    # All styling (~32 KB)
├── sw.js         # Service worker: offline cache + push notifications
├── manifest.json # PWA manifest (name, icons, theme colour)
└── icon.svg      # App icon
```

## Status

Actively built and in use by its author for daily planning. The codebase is a single-page app with no backend; your tasks live in the browser.
