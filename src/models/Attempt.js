/* ============================================================================
 *  One quiz attempt.
 *
 *  Mirrors what the site already works out in src/lib/identify.js: a verdict, the
 *  confidence behind it, and the per-question detail that produced it — including
 *  how long each answer took and how many times the person changed their mind,
 *  which is half of how the site decides whether it is really her.
 *
 *  `strict: true` (the default) means anything not described here is dropped
 *  rather than stored, so an unexpected field in a request body cannot end up in
 *  the collection.
 * ========================================================================== */

import mongoose from 'mongoose';
import { config } from '../config.js';

export const VERDICTS = ['girlfriend', 'unsure', 'friend'];

/* Matches the question kinds in src/config.js, plus a catch-all so a new kind of
 * question cannot start rejecting writes before this list is updated. */
export const QUESTION_TYPES = ['direct', 'secret', 'text', 'fun', 'decoy', 'other'];

const answerSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true, maxlength: 64 },
    type: { type: String, enum: QUESTION_TYPES, default: 'other' },

    /* The prompt is denormalised on purpose. The questions in config change over
     * time, and an answer that cannot be read back next to the question it
     * answered is worth very little. */
    prompt: { type: String, maxlength: 300, default: '' },

    /* Multiple choice. */
    optionId: { type: String, maxlength: 32, default: null },
    optionLabel: { type: String, maxlength: 240, default: null },

    /* Typed answers. */
    text: { type: String, maxlength: 1000, default: null },

    /* null for questions that are not scored, like the 'fun' ones. */
    correct: { type: Boolean, default: null },

    /* The behavioural signals. */
    elapsedMs: { type: Number, min: 0, default: 0 },
    changes: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const attemptSchema = new mongoose.Schema(
  {
    /* Random id the browser keeps in localStorage. Lets several attempts from the
     * same device be grouped without storing anything identifying. */
    sessionId: { type: String, maxlength: 64, default: null, index: true },

    verdict: { type: String, enum: VERDICTS, required: true, index: true },
    confidence: { type: Number, min: 0, max: 1, required: true },
    knowledge: { type: Number, min: 0, max: 1, default: null },
    behaviour: { type: Number, min: -1, max: 1, default: null },

    /* The lines the site threw back at them, kept because they are the readable
     * summary of why the verdict went the way it did. */
    tells: { type: [{ type: String, maxlength: 240 }], default: [] },

    /* Did they need the sudden-death question, and did the device already count
     * as verified before this attempt? */
    tiebreakUsed: { type: Boolean, default: false },
    knownReturner: { type: Boolean, default: false },

    /* Start of the first question to the last answer. */
    durationMs: { type: Number, min: 0, default: 0 },

    answers: { type: [answerSchema], default: [] },

    /* Enough to tell a phone from a laptop, and nothing more. */
    client: {
      userAgent: { type: String, maxlength: 240, default: null },
      language: { type: String, maxlength: 32, default: null },
      timezone: { type: String, maxlength: 64, default: null },
      screen: { type: String, maxlength: 16, default: null },
    },

    /* Salted hash, and only when IP_HASH_SALT is configured. The raw address is
     * never written down. */
    ipHash: { type: String, maxlength: 32, default: null },
  },
  {
    timestamps: true,
    collection: 'quiz_attempts',
  }
);

/* The read route is always "most recent first". */
attemptSchema.index({ createdAt: -1 });

/* Optional retention. A TTL index has to be declared with the schema, so it is
 * only added when a lifetime was actually configured. */
if (config.attemptTtlDays > 0) {
  attemptSchema.index(
    { createdAt: 1 },
    { expireAfterSeconds: config.attemptTtlDays * 24 * 60 * 60 }
  );
}

export const Attempt = mongoose.model('Attempt', attemptSchema);
