const randomize = require('randomatic');
const Game = require('./Game');

class Room {
  constructor() {
    const id = randomize('A', 5);
    this.id = id;
    this.players = [];
    this.host = null;
    this.game = null;
  }

  commAll(message, data) {
    this.players.forEach((uid) => {
      global.USERS[uid].comm(message, data);
    });
  }

  join(user) {
    if (user.current_room) return;
    if (this.players.includes(user.id)) return;
    this.players.push(user.id);
    user.current_room = this.id;
  }

  leave(user) {
    if (user.current_room != this.id) return;
    this.players = this.players.filter((s) => s !== user.id);
    user.current_room = null;
    if (!this.players.length) {
      delete global.ROOMS[this.id];
      return;
    }
    if (this.host === user.id) {
      this.host = this.players[0];
    }
  }

  getPlayers() {
    return this.players.map((id) => {
      const { name } = global.USERS[id];
      return {
        id,
        name,
        isHost: this.host === id,
      };
    });
  }

  startGame() {
    this.game = new Game(this.players);
    this.game.start();
  }
}

module.exports = Room;
