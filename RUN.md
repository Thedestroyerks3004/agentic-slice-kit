# Put your OpenRouter or OpenAI key in skillmind/.env.local as:  VITE_OPENAI_API_KEY=sk-...
# Then open http://localhost:5173 in a browser.
npm --prefix skillmind install && npm --prefix skillmind run dev

---

# How to run SkillMind, in detail

SkillMind is a browser app (React, TypeScript, Vite). It has no server of its own. The browser calls the
model provider directly, using the key you put in `.env.local`.

## 1. What you need

- Node.js and npm. The app was developed on Node 24. Any current Node release should work.
- A browser.
- An API key, for live questions. Without one the app still runs, but only on pre-written backup questions.

## 2. Add your key (once)

Create the file `skillmind/.env.local`. Start from the template:

```
cp skillmind/.env.example skillmind/.env.local
```

Then edit it so it contains:

```
VITE_OPENAI_API_KEY=sk-or-your-key-here
VITE_MODEL=
```

- **`VITE_OPENAI_API_KEY`** is the only key the app uses. Nothing typed into the app is used as a key.
  - A key starting with `sk-or-` is an **OpenRouter** key. Requests go to OpenRouter. The default model is the
    free `nvidia/nemotron-3-super-120b-a12b:free`.
  - Any other `sk-` key is an **OpenAI** key. Requests go to OpenAI. The default model is `gpt-4.1-mini`.
- **`VITE_MODEL`** is optional. Leave it empty for the default above, or put a model name to use that one
  model for everything, for example `openai/gpt-4o-mini` on OpenRouter.
- `.env.local` is git-ignored, so your key is never committed.
- The key is read when the dev server starts. **After changing `.env.local`, stop the server and start it
  again.**

## 3. Start it

From the repository root (the folder that contains `.git`):

```
npm --prefix skillmind install
npm --prefix skillmind run dev
```

Or as one command: `npm --prefix skillmind install && npm --prefix skillmind run dev`.

Open **http://localhost:5173**. If that port is busy, Vite prints the port it chose instead.

## 4. What to do in the app

1. **Intake:** enter a name and a roll number, then Start. Progress is saved in the browser under that
   roll number, so a refresh or a later visit picks up where you stopped.
2. **Score graph:** the list of 14 DBMS topics in five units. Pick a topic to read what it covers, or use the
   Map toggle to see how topics depend on each other.
3. **Quick check:** two questions per topic. Each one is written live by the model. A wrong answer shows the
   correct answer and why, and you press Continue.
4. **Go deeper:** about eight fresh questions on one topic. A failed contrast question at the end can reopen
   a topic that looked settled. That is the agent's back-edge.
5. **Outcome:** what to work on, and the answers that prove it.

## 5. Check that a model is really involved

- The header shows **Live questions** (green) when the model is writing them, or **Backup questions**
  (amber) when it is not. Hovering the badge gives the reason.
- Open **Settings** and tick **Simulate offline** to force the backup set without disconnecting. Or switch the
  network off. Live questions change every time you ask. Backup questions are the same each time.
- The cost chip in the header shows the estimated spend for the session. It is $0 on the free OpenRouter model.

## 6. Other commands

Run these from the repository root.

| Purpose | Command |
|---|---|
| Unit tests | `npm --prefix skillmind test` |
| Type-check and production build | `npm --prefix skillmind run build` |
| Serve the production build | `npm --prefix skillmind run preview` |

## 7. If something goes wrong

| Symptom | Likely cause and fix |
|---|---|
| Header says **Backup questions** | No key found, or the model is paused after errors. Check `.env.local`, restart the server, and see the badge tooltip. |
| "Key rejected" or "out of credit" notice | The key is wrong or the account has no credit. Fix it and restart the server. |
| Live calls often fall back to backup on the free model | The free tier is slow at busy times. Set `VITE_MODEL` to a paid model and restart. |
| `npm` cannot find `skillmind` | You are not in the repository root. |
| Port 5173 is in use | Vite picks the next port and prints it. Use that address. |
