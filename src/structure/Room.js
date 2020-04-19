const randomize = require('randomatic');
const Game = require('./Game');

const { ROOM } = require('../util/msg');
class Room {
  constructor() {
    const id = randomize('A', 5);
    this.id = id;
    this.players = [];
    this.host = null;
    this.game = null;
  }

  commAll(message, data) {
    this.players.forEach(({ id }) => {
      global.USERS[id].comm(message, data);
    });
  }

  join(user) {
    if (user.current_room) throw new Error('User is already in a room.');
    if (this.players.find(({ id }) => id === user.id))
      throw new Error('User is already in this room.');
    if (this.game && !this.game.end_result)
      throw new Error('Game already in progress.');

    const { id, name, emoji } = user;
    this.players.push({ id, name, emoji, isReady: false });
    user.current_room = this.id;

    user.comm(ROOM.JOIN, this.id);
    this.commAll(ROOM.UPDATE, this.getPlayers());
  }

  leave(user) {
    if (user.current_room != this.id)
      throw new Error("Can't leave a room the user is not in.");

    this.players = this.players.filter(({ id }) => id !== user.id);
    user.current_room = null;
    if (!this.players.length) {
      delete global.ROOMS[this.id];
    } else if (this.host === user.id) {
      this.host = this.players[0].id;
    }

    user.comm(ROOM.LEAVE);

    if (
      this.game &&
      !this.game.players[user.id].isDead &&
      !this.game.end_result
    ) {
      this.game.is_interrupted = true;
      this.game = null;
      this.commAll(ROOM.JOIN, this.id);
    }

    this.commAll(ROOM.UPDATE, this.getPlayers());
  }

  toggleReady(user) {
    this.players = this.players.map(({ isReady, ...player }) => ({
      ...player,
      isReady: user.id === player.id ? !isReady : isReady,
    }));

    this.commAll(ROOM.UPDATE, this.getPlayers());
  }

  getPlayers() {
    return this.players.map(({ id, name, emoji, isReady }) => ({
      id,
      name,
      emoji,
      isReady,
      isHost: this.host === id,
    }));
  }

  startGame(user) {
    if (this.host !== user.id) throw new Error('User is not a host');
    if (this.players.length < 4)
      throw new Error('Minimum 4 players required to start the game');
    if (this.players.find(({ isReady }) => !isReady))
      throw new Error('Not everyone is ready');

    this.game = new Game(this.players);
    this.game.start();
  }
}

module.exports = Room;
