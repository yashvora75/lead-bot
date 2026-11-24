# Lead Desk

The [GitHub Pages CRM](https://yashvora75.github.io/lead-bot/) loads live leads from the existing Google Sheet without a Google sign-in. The local lead-finding bot continues to add leads to the Sheet. The website is a static interface; the Sheet remains the database.

## Connection

The Apps Script source is in `apps-script/Code.gs`. Its web app is deployed to execute as the Sheet owner with access set to **Anyone**. The `/exec` URL is configured in `public-config.js`. The website reads all active lead tabs on opening and on Refresh. Edits to notes, follow-ups, stages, and deals are saved back to their original Sheet rows. CRM edits are recorded in the Sheet's `Activity Log` tab.

The New, Contacted, Ongoing, and Closed views are calculated from Sheet fields, so leads move between views without creating duplicate rows. Direct Sheet edits and bot writes are not included in the CRM activity log.

## Access and audit limits

Anyone with the published CRM or Apps Script URL can read the lead data and submit permitted edits. The caller selector labels changes as Yash or Priyamvada but does not verify identity. Activity records therefore cannot prove who made a change and can be altered by Sheet editors. Do not put a password, service account key, Places API key, or Sheet export in this repository.

## Local preview

Run `python -m http.server 8080` in this directory and open `http://localhost:8080`. The page uses the same live Sheet service as the published site.
