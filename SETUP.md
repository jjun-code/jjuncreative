# Putting jjuncreative online

One-time setup, about 15–20 minutes. No terminal needed.
After this, you edit everything at **yoursite.com/keystatic**.

---

## 1. Put the code on GitHub

1. Go to **github.com** and sign up (free).
2. Click **+** (top right) → **New repository**.
   - Name: `jjuncreative`
   - Private is fine.
   - Click **Create repository**.
3. On the empty repo page, click **uploading an existing file**.
4. Unzip `jjuncreative-site.zip` on your computer, open the folder, select **everything inside it**
   (including the hidden `.gitignore` if you can see it), and drag it into the browser.
5. Click **Commit changes**.

## 2. Connect the editor (Keystatic Cloud)

1. Go to **keystatic.cloud** and sign in with GitHub.
2. Create a team (any name, e.g. your name), then **Create project** → name it `jjuncreative`.
3. Connect it to the `jjuncreative` GitHub repo when asked and approve access.
4. Note the project's ID. It looks like `your-team/jjuncreative`. You'll need it in step 3.

## 3. Host it on Cloudflare Workers (free)

1. Go to **dash.cloudflare.com** and sign up (free).
2. **Workers & Pages** → **Create** → **Import a repository** → pick the `jjuncreative` repo.
3. Build settings:
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
4. Under **Build variables**, add:
   - `PUBLIC_KEYSTATIC_PROJECT` = the ID from step 2 (e.g. `your-team/jjuncreative`)
   - `NODE_VERSION` = `24`
5. Click **Deploy**. In a couple of minutes you'll get a `something.workers.dev` link.
6. Back in Keystatic Cloud, open your project settings and add that site URL if asked.

## 4. Move your domain from Framer

1. In Cloudflare: your Worker → **Settings** → **Domains & Routes** → **Add** → **Custom domain** → `www.jjuncreative.com`.
2. If your domain isn't on Cloudflare yet, it will walk you through moving the domain's nameservers there.
3. Remove the domain from Framer.

## 5. Before you cancel Framer

Your project images still load from Framer's servers. For each project in **/keystatic**,
upload the image into the empty upload slot above each "old Framer link" field and save.
Do the same for your portrait on the About page.

---

## Day-to-day editing

- Go to **www.jjuncreative.com/keystatic** and sign in.
- **Projects**: add, edit or reorder (use *Sort order*). Tick *Feature on home page* to put its images
  on the rotating ring. Under *Project colour*, pick the colour that tints the top of its page.
- **Home page / About page / Contact & site details**: all the text on those pages.
- Hit **Save**. The site rebuilds itself and is live in about 2 minutes.

## Changing the look

Colours and fonts live at the top of `src/styles/global.css`. Ask Claude to change them for you.
