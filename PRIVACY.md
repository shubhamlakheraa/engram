# Privacy Policy — Engram

_Last updated: 2026-09-02_

Engram is a Chrome extension that automatically logs your LeetCode solutions and schedules spaced repetition reviews using the FSRS algorithm.

## What data Engram collects

Engram collects only the data necessary to operate the spaced repetition system:

- **Email address** — used to create and identify your Engram account
- **LeetCode submission data** — problem title, number, difficulty, topics, your solution code, runtime, memory usage, and the date you solved it
- **Notes** — the optional quick note you add when logging a problem

This data is transmitted to Engram's backend server over HTTPS and stored in a private Supabase (PostgreSQL) database accessible only to your account.

## Google user data

When you connect Google Calendar, Engram requests two scopes:

- **calendar.events** — used exclusively to create and delete Google Calendar events for scheduled spaced repetition reviews. Each event contains the problem name, review date, and a link to your review page. No existing calendar events are read, modified, or accessed.
- **calendar.readonly** — used exclusively to read your calendar's timezone setting so review events are created at 9:00 AM in your local timezone rather than UTC. No calendar event data, titles, descriptions, or attendees are read or stored.

Google user data is used only to provide the Calendar reminder feature. It is never shared with third parties, never used for advertising, and never transferred for purposes unrelated to this feature. OAuth tokens are stored encrypted at rest in Supabase and transmitted only over HTTPS. You can revoke access at any time from the Engram Settings page or from your Google Account permissions page.

## What Engram shares with third parties

Engram integrates with two optional third-party services, both requiring your explicit authorization:

- **Notion** — if you connect your Notion account, Engram creates a database page for each problem you log. This sends your submission data to Notion's servers. You can disconnect at any time from the Settings page.
- **Google Calendar** — if you connect your Google account, Engram creates calendar events for scheduled reviews as described above. You can disconnect at any time from the Settings page.

Neither integration is required. If you don't connect them, no data is sent to Notion or Google.

## What data Engram does NOT collect

- No analytics or telemetry
- No crash reports
- No browsing history
- No data from any website other than LeetCode submission results

## Data protection

- All data is transmitted over HTTPS/TLS — never over plain HTTP
- Data at rest is stored in Supabase (PostgreSQL) with row-level security — each user can only access their own data
- OAuth tokens (Google, Notion) are stored server-side only and never exposed to the browser
- Passwords are hashed with bcrypt before storage — plaintext passwords are never stored
- Authentication uses short-lived JWTs — tokens expire and cannot be reused after logout

## Permissions used

- **storage** — stores your login token and settings locally in Chrome
- **identity** — used for Google Calendar OAuth
- **notifications** — alerts you when a LeetCode submission is accepted
- **leetcode.com** — reads submission results to capture solve data
- **api.notion.com** — creates and updates problem pages in your Notion workspace
- **googleapis.com** — creates Google Calendar review events and reads calendar timezone
- **engram.shubhamlakhera.dev** — communicates with Engram's backend for authentication and data storage

## Data deletion

You can request deletion of all your data by contacting us at the email below. Uninstalling the extension removes all locally stored data automatically.

## Changes to this policy

If data practices change, this document will be updated with a new "Last updated" date.

## Contact

Questions or concerns: [lakherashubham.dev@gmail.com](mailto:lakherashubham.dev@gmail.com)
