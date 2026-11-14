# ProjectFlow 360 — Stage tracker

A simple, single-administrator tracker for project stages. Each **project** has **items**, and each item
has a list of **stages** (in-house availability check → PR → PR approval → quotations → PO → PI → payment
→ vendor dispatch → SPIF receipt → material request → logistics → GVT receipt → development → testing →
closure). The work happens outside the app; you record it here:

- set each stage's **status** (Not Started, In Progress, Waiting, On Hold, Completed, Not Applicable);
- **mark it complete** with the completion date;
- add **expected start / completion dates**, a **reference** (PR, PO or invoice number), **notes** and
  **comments** — at any time, before or after completion;
- add, rename, remove or reorder stages for any item; change the standard list for new items;
- see what is **overdue** and **due soon** on the dashboard and the Deadlines page.

| Role | Can do |
|---|---|
| **Administrator** (you — only one) | Everything: projects, items, stages, dates, users, settings, backup |
| **Commenter** | View everything; add comments; delete their own comments |
| **Viewer** | View everything (not the user list) |

It is a static website (HTML, CSS, JavaScript — no build step) that you host free on **GitHub Pages**,
with **Firebase Authentication** and the **Firebase Realtime Database** on the free Spark plan.

---

## 1. Try it first (demo mode)

Until Firebase is connected, the app runs in **demo mode**: data is kept only in your browser, with
sample projects and three demo accounts — `admin`, `commenter`, `viewer`, password `demo1234`. Demo
accounts never exist in your Firebase project.

To open it on your computer, run any static web server in this folder, for example
`npx http-server -c-1 -p 8080 .` and open <http://localhost:8080>. (Opening `index.html` by
double-clicking does not work: browsers block JavaScript modules on `file://`.)

---

## 2. Connect your Firebase database

Your project is **`projectflow360-2`** and its database is
`https://projectflow360-2-default-rtdb.asia-southeast1.firebasedatabase.app` — both already exist and are
already written into `js/config/firebase-config.js`. Do these steps once, in order, at
<https://console.firebase.google.com> → **projectflow360-2**.

### Step 1 — Turn on username/password sign-in
**Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
(Leave "Email link" off.)

### Step 2 — Publish the security rules
**Build → Realtime Database → Rules.** Delete everything in the editor, paste the whole content of
`firebase/database.rules.json` from this folder, and click **Publish**.
These rules are what protect your data: only the administrator can change anything, commenters can only
add comments under their own name, and signed-out people can read nothing.

### Step 3 — Register the web app
**Project Overview (home) → Add app → Web (`</>`)**. Nickname: `ProjectFlow 360`. Leave
"Firebase Hosting" unticked → **Register app**. Firebase shows a `firebaseConfig` block.
(Already registered? **Project settings (gear) → General → Your apps**.)

### Step 4 — Copy `apiKey` and `appId` into the app
Open `js/config/firebase-config.js` and fill in the two empty values from that block:

```js
apiKey: 'AIza…',            // from the Firebase block
authDomain: 'projectflow360-2.firebaseapp.com',                                    // already filled
databaseURL: 'https://projectflow360-2-default-rtdb.asia-southeast1.firebasedatabase.app', // already filled
projectId: 'projectflow360-2',                                                      // already filled
appId: '1:…:web:…',         // from the Firebase block
```

These values are not secrets (they only name your project); your data is protected by the rules.
Never put a service-account key or any password in this folder.

### Step 5 — Create your administrator sign-in
**Authentication → Users → Add user**:
- Email: `suyash@pf360.example.com` (your username + `@pf360.example.com`; no e-mail is ever sent)
- Password: the initial password from your requirements document — you must change it at first sign-in.

Click **Add user**, then copy the **User UID** shown in the list (hover the row → copy icon).

### Step 6 — Name it as the set-up account
**Realtime Database → Data**. Hover the database URL at the top and click **+**:
1. **Key:** `system` — leave **Value** empty — click the **+** at the end of that row (a child row appears).
2. In the child row: **Key** `bootstrapUid`, **Value** the UID you copied (no quotes), type **string**.
3. Click **Add**.

The Data tab should then show `system → bootstrapUid: "your-UID"`.

### Step 7 — Publish the site (GitHub Pages)
1. Create a repository on GitHub (for example `projectflow360-tracker`) and upload **all files of this
   folder** (keep the folder structure, including the empty `.nojekyll` file).
2. Repository **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**.
3. After a minute the site is at `https://<your-github-name>.github.io/projectflow360-tracker/`.

### Step 8 — First sign-in
Open the site and sign in as `suyash` with the initial password. The **Set up ProjectFlow 360** screen
appears: check your display name and organisation name → **Initialise the system**. You are then asked to
choose your own password. Done — the rules now close the set-up route for good (you may delete
`system/bootstrapUid` later; it is no longer used).

> **"This system is not set up yet"** instead? The UID in `system/bootstrapUid` does not match the account
> you signed in with. The screen shows the correct UID with a Copy button.

---

## 3. Everyday use

- **New project:** Dashboard or Projects → *New project*. The code (e.g. `DRN-A1`) cannot change later.
- **Add item:** open the project → *Add item*. It starts with the standard stage list.
- **Update a stage:** on the item page change the status right in the list, or click the stage to open it:
  *Mark complete* (asks for the completion date and an optional comment), *Edit dates & details*
  (expected start/completion, actual start, completed on, responsible, reference, notes), comments and
  its change history. Dates never complete a stage by themselves — only you do.
- **Stage does not apply?** Set it to *Not Applicable* (it no longer counts towards progress).
- **Different stages for one item:** *Add stage* (choose its position), the arrows to reorder, the bin to remove.
- **Change the standard list for new items:** Administration → *Stage list*.
- **Deadlines:** overdue, due soon (window set in Administration → Settings), waiting/on hold, upcoming,
  no date set. Every list exports to CSV for Excel.
- **Close a project:** Edit project → status *Completed* (or *Cancelled*). Closed projects leave the
  dashboard and deadlines but stay under Projects → *Completed / cancelled*.

### Users (Administration → Users)
- **Add user:** name, username, role (Commenter or Viewer) and a temporary password (pre-filled with a
  random one — note it down). They must choose their own password at first sign-in.
- **Edit:** change name or role, or switch the account off (*Account is active*).
- **Reset password:** Firebase's free plan cannot change someone else's password from a web page, so the
  app issues a fresh sign-in for the same username (same name and role) and switches the old one off. The
  person signs in with the same username and the new temporary password.
- To delete a sign-in completely, also remove it in Firebase → Authentication → Users.

There is only one administrator by design; the rules refuse to create a second one and refuse to let you
demote or switch off yourself.

### Backup
Administration → **Backup** downloads everything as one JSON file (and all stages as CSV). To restore, use
Firebase → Realtime Database → Data → ⋮ → **Import JSON** on the node to replace (it replaces that node
completely — take a fresh backup first).

---

## 4. Security — what protects your data

- **Firebase Authentication** checks passwords. Passwords are never stored in the database or in the code;
  the initial administrator password is not in any file.
- **Security Rules** (`firebase/database.rules.json`, generated by `npm run rules` from
  `firebase/build-rules.mjs`) are checked by Firebase's servers on every read and write, whatever the
  browser does. Hiding a button is never the protection. The rules allow:
  - signed out: nothing (except reading one username's sign-in version number, needed to sign in);
  - viewer: read projects, items, stages, comments, history and settings;
  - commenter: the same, plus adding comments **under their own user and name only**, and deleting their own;
  - administrator: everything, except creating another administrator or demoting / deactivating themselves;
  - switched-off accounts: nothing;
  - set-up: only the account named in `system/bootstrapUid`, and only while `system/initialized` is absent.
- **Demo mode** is clearly labelled, keeps data only in the browser, and its accounts cannot sign in to Firebase.
- No Cloud Functions, no Admin SDK, no service-account keys — none are needed.

## 5. Troubleshooting

| What you see | What to do |
|---|---|
| Still says **Demo mode** | `apiKey` and/or `appId` are empty in `js/config/firebase-config.js` (the sign-in page lists which). |
| "Email/Password sign-in is not enabled" | Step 1. |
| "You do not have permission to do this" | The rules from Step 2 are not published, or your account is not the administrator. |
| "This system is not set up yet" | Step 6: the UID in `system/bootstrapUid` must be the UID of the account you signed in with. |
| Stuck on "Loading…" | Check the browser console. This computer must reach `www.gstatic.com` (Firebase's code). |
| Administrator forgot the password | Firebase → Authentication → Users → *Add user* `suyash.v2@pf360.example.com` with a temporary password and copy its UID. Realtime Database → Data: set `loginIndex/suyash/v` to `2`; under `users` add a child with that new UID and the children `username` = `suyash`, `name` = your name, `role` = `admin`, `active` = `true` (boolean), `mustChangePassword` = `true` (boolean); set the old `users/<old UID>/active` to `false`. Sign in with the temporary password. |

## 6. For developers

```
index.html                 the only page
css/app.css, login.css     look and feel (light glass theme)
js/config/                 firebase-config.js (edit to go live), app-config.js (roles, statuses, default stages)
js/backend*.js             Firebase backend and the browser-only demo backend
js/data.js                 sign-in states, live data, every change (one atomic update each)
js/model.js                calculations: progress, deadlines, item state
js/views/                  dashboard, projects, item (stages), deadlines, admin, sign-in screens
firebase/                  build-rules.mjs → database.rules.json
tests/                     rules (targaryen), calculations, browser smoke test
```

`npm install` then `npm test` (security rules + calculations) and `npm run test:browser`
(needs Chrome: `CHROME=/path/to/chrome npm run test:browser`).
