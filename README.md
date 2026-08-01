# Quiz server

Stores quiz attempts from the Girlfriend's Day site in MongoDB.

Standalone on purpose: its own `package.json`, its own dependencies, no imports
from the site. You can push this folder to GitHub as its own repository and deploy
it anywhere that runs Node.

## Setup

```bash
cd server
npm install
cp .env.example .env      # then open .env and paste your MongoDB URI in
npm start
```

`.env.example` ships with a dummy URI. The server checks for it at boot and
refuses to start until it's replaced, so you get a clear message instead of a
confusing DNS error later.

Your URI comes from Atlas: **Database > Connect > Drivers**. Swap
`<db_password>` for the database user's password (not your Atlas login).

To read attempts back you also need `ADMIN_TOKEN`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Endpoints

| Method | Path                         | Auth          | Purpose                       |
| ------ | ---------------------------- | ------------- | ----------------------------- |
| GET    | `/api/health`                | none          | Liveness and connection state |
| POST   | `/api/quiz-attempt`          | none, limited | Record one attempt            |
| GET    | `/api/quiz-attempts`         | `ADMIN_TOKEN` | Recent attempts, newest first |
| GET    | `/api/quiz-attempts/summary` | `ADMIN_TOKEN` | Counts only, no answers       |

Reading:

```bash
curl -H "X-Admin-Token: $ADMIN_TOKEN" http://127.0.0.1:4500/api/quiz-attempts
curl -H "X-Admin-Token: $ADMIN_TOKEN" http://127.0.0.1:4500/api/quiz-attempts/summary
curl -H "X-Admin-Token: $ADMIN_TOKEN" "http://127.0.0.1:4500/api/quiz-attempts?verdict=girlfriend&limit=5"
```

`?token=...` works too, but the header is better: query strings end up in server
logs, proxy logs and shell history.

## What gets stored

One document per finished attempt, in the `quiz_attempts` collection:

```jsonc
{
  "sessionId": "b2f1...",        // random per browser, from localStorage
  "verdict": "girlfriend",       // girlfriend | unsure | friend
  "confidence": 0.86,
  "knowledge": 0.91,             // score from the answers
  "behaviour": 0.07,             // score from speed and changes of mind
  "tells": ["You changed your mind. Repeatedly."],
  "tiebreakUsed": false,
  "knownReturner": false,
  "durationMs": 48213,
  "answers": [
    {
      "questionId": "first-chat",
      "type": "secret",
      "prompt": "When did we have our very first chat?",
      "optionId": "d",
      "optionLabel": "29th May",
      "text": null,              // set instead of optionId on typed questions
      "correct": true,           // null when the question isn't scored
      "elapsedMs": 4120,
      "changes": 0
    }
  ],
  "client": { "userAgent": "...", "language": "en-GB", "timezone": "Asia/Kolkata", "screen": "390x844" },
  "ipHash": null,                // only when IP_HASH_SALT is set
  "createdAt": "2026-08-01T12:00:00.000Z"
}
```

The prompt and option label are copied in alongside the ids. The questions in
`src/config.js` change over time, and an answer you can't read next to the
question it answered isn't worth much.

## Connecting the site to it

Local development: nothing to do. The site's `vite.config.js` proxies everything
under `/api` to `127.0.0.1:4500`. Run `npm run dev` in the site and `npm start`
here — or `npm run server` from the site's root, which runs this package for you.

Deployed: set `VITE_API_BASE` to this server's URL before building the site, and
add the site's origin to `ALLOWED_ORIGINS` here.

```bash
# in the site's .env
VITE_API_BASE=https://your-server.example

# in server/.env
ALLOWED_ORIGINS=https://your-site.example
```

Deploying to Render, Railway, Fly or similar: `npm ci` is the build step,
`npm start` is the start command, and every variable in `.env.example` goes in
the host's environment settings. Atlas also needs to allow the host's outbound
IP under **Network Access**.

The site treats this server as optional. Every request is fire-and-forget, so if
it's down, not deployed, or blocked, the page carries on and she sees no
difference.

## How the data is protected

Worth knowing, since her typed answers are in here.

- **Reads are off by default.** No `ADMIN_TOKEN` means
  `GET /api/quiz-attempts` returns 503, not everything in the collection. A read
  route that quietly becomes public when a variable is missing is how this sort of
  data leaks, and nobody notices that it "worked" without the token.
- **The token comparison is constant time.** `===` leaks the length of the
  matching prefix through timing, which is enough to recover a token one
  character at a time.
- **CORS is open by default.** The server replies with `Access-Control-Allow-Origin: *`
  for browser requests, so `ALLOWED_ORIGINS` is only there if you want to tighten
  that later.
- **Nothing is stored that wasn't explicitly copied across.** Every field in an
  incoming body is coerced to the right type and cut to length in
  `src/lib/sanitize.js`; anything else is dropped.
- **Writes are rate limited** to 20 per minute per address, so nobody can sit on
  refresh and fill your cluster.
- **No raw IP addresses.** With `IP_HASH_SALT` set, addresses are stored as a
  short salted hash; without it, nothing IP-derived is stored. The salt matters:
  the IPv4 space is small enough to enumerate, so an unsalted hash is barely
  different from keeping the address.
- **`.env` is gitignored** and the connection string is never logged, including
  in error messages.

## Layout

```
src/
  index.js              start up: connect, then listen
  app.js                Express app assembly
  config.js             environment, validated at boot
  db.js                 the Mongo connection
  models/Attempt.js     the schema
  lib/sanitize.js       request body -> storable document
  lib/clientMeta.js     IP hashing and user agent
  middleware/           CORS, rate limit, admin token
  routes/attempts.js    the three endpoints
```
