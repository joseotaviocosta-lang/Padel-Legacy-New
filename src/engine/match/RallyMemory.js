const MAX_EVENTS = 24;

export class RallyMemory {
  constructor() {
    this.events = [];
  }

  record(event) {
    this.events.push({ ...event });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }

  recent(count = 6) {
    return this.events.slice(-count);
  }

  recentForTeam(team, count = 6) {
    return this.events.filter((event) => event.team === team).slice(-count);
  }

  consecutiveShot(team, shot) {
    let total = 0;
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      const event = this.events[index];
      if (event.team !== team) continue;
      if (event.shot !== shot) break;
      total += 1;
    }
    return total;
  }

  shotFrequency(team, shot, windowSize = 8) {
    const recent = this.recentForTeam(team, windowSize);
    if (!recent.length) return 0;
    return recent.filter((event) => event.shot === shot).length / recent.length;
  }

  opponentNetPressure(team, windowSize = 8) {
    const opponent = team === 'A' ? 'B' : 'A';
    const recent = this.recentForTeam(opponent, windowSize);
    if (!recent.length) return 0;
    const attacking = recent.filter((event) => ['volley', 'smash', 'bandeja'].includes(event.shot)).length;
    return attacking / recent.length;
  }

  summary(team) {
    return {
      repeatedShot: this.recentForTeam(team, 4).map((event) => event.shot),
      opponentNetPressure: this.opponentNetPressure(team),
      lobFrequency: this.shotFrequency(team, 'lob'),
      smashFrequency: this.shotFrequency(team, 'smash'),
    };
  }
}
