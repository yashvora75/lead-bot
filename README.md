# Lead Desk

A static GitHub Pages view of the existing Google Sheets lead database. The local CRM bot continues to populate the Sheet. The site never stores lead data in GitHub and never needs the bot's service-account key or Places API key.

## Set up

1. Copy `index.html`, `styles.css`, `app.js`, `.nojekyll`, and this README to the root of `https://github.com/yashvora75/lead-bot`. The repository is public; do not upload the Sheet export, service-account key, or Places API key.
2. In repository **Settings → Pages**, deploy from the main branch and root folder. Note that the published site URL itself is public; the lead data remains behind each user's Google authorization.
3. In the Google Cloud project for the Sheet, enable the **Google Sheets API**. Configure the OAuth consent screen and create an **OAuth 2.0 client ID** of type **Web application**. Add `https://yashvora75.github.io` as an authorized JavaScript origin. Add each team member as an OAuth test user if the consent screen is in Testing status.
4. Share the Google Sheet with each team member's Google account at the appropriate permission level. They enter the OAuth client ID once in the website and sign in. The site requests read-only Sheets access. Call notes and statuses are edited in Google Sheets through the link in each lead detail.

The browser reads current Sheet values when the page connects or the user clicks Refresh. The OAuth client ID is saved in localStorage; the access token is kept only in memory. The website has no backend or scheduled GitHub Action. No CSV or JSON containing leads should be committed to the repository.

For a quick interface check before OAuth is set up, export one Sheet tab to CSV and use **Preview with a CSV export instead**. The file stays in the browser.

## Local preview

Run a static server in this directory, for example `python -m http.server 8080`, then open `http://localhost:8080`. For Google sign-in during local testing, add `http://localhost:8080` to the OAuth client's authorized JavaScript origins.
