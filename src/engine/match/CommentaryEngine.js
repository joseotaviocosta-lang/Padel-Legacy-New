import { NarrativeEngine } from './NarrativeEngine.js';

export class CommentaryEngine {
  constructor({ narrative = new NarrativeEngine() } = {}) {
    this.narrative = narrative;
  }

  describe(payload) {
    return this.narrative.describePoint(payload);
  }

  point(payload) {
    return this.describe(payload).message;
  }
}
