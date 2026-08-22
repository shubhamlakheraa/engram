# Privacy Policy — Engram

_Last updated: 2026-08-15_

Engram is a Chrome extension that automatically logs your LeetCode solutions and schedules spaced repetition reviews using the FSRS algorithm.

## What data Engram collects

Engram collects only the data necessary to operate the spaced repetition system:

- **Email address** — used to create and identify your Engram account
- **LeetCode submission data** — problem title, number, difficulty, topics, your solution code, runtime, memory usage, and the date you solved it
- **Notes** — the optional quick note you add when logging a problem

This data is transmitted to Engram's backend server and stored in a private Supabase database accessible only to your account.

## What Engram shares with third parties

Engram integrates with two optional third-party services, both requiring your explicit authorization:

- **Notion** — if you connect your Notion account, Engram creates a database page for each problem you log. This sends your submission data to Notion's servers. You can disconnect at any time from the Settings page.
- **Google Calendar** — if you connect your Google account, Engram creates calendar events for scheduled reviews. This sends problem titles and review dates to Google's servers. You can disconnect at any time from the Settings page.

Neither integration is required. If you don't connect them, no data is sent to Notion or Google.

## What data Engram does NOT collect

- No analytics or telemetry
- No crash reports
- No browsing history
- No data from any website other than LeetCode submission results

## Permissions used

- **storage** — stores your login token and settings locally in Chrome
- **identity** — used for Google Calendar OAuth
- **notifications** — alerts you when a LeetCode submission is accepted
- **alarms** — reserved for future scheduled review reminders
- **leetcode.com** — reads submission results to capture solve data
- **api.notion.com** — creates and updates problem pages in your Notion workspace
- **googleapis.com** — creates Google Calendar review events
- **engram-ijh1.onrender.com** — communicates with Engram's backend for authentication and data storage

## Data deletion

You can delete your data by contacting us. Uninstalling the extension removes all locally stored data automatically.

## Changes to this policy

If data practices change, this document will be updated with a new "Last updated" date.

## Contact

Questions or concerns: [lakherashubham.dev@gmail.com](mailto:lakherashubham.dev@gmail.com)
