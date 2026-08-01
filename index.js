import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';

const PORT = Number(process.env.PORT) || 4500;
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'girlfriends_day';

if (!MONGODB_URI) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

const app = express();

app.use(express.json({ limit: '16kb' }));

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

const attemptSchema = new mongoose.Schema({}, { strict: false, timestamps: true, collection: 'quiz_attempts' });
const Attempt = mongoose.models.Attempt || mongoose.model('Attempt', attemptSchema);

app.post('/api/quiz-attempt', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'body must be an object' });
    }

    console.log('Saving quiz attempt:', req.body);

    const saved = await Attempt.create(req.body);
    return res.status(201).json({ ok: true, id: saved._id });
  } catch (error) {
    console.error('Could not save quiz attempt:', error.message);
    return res.status(500).json({ error: 'could not save' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

async function main() {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Could not connect to MongoDB:', error.message);
    process.exit(1);
  }
}

main();