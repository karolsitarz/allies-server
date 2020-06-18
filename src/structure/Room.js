const randomize = require('randomatic');
const Game = require('./Game');

const { ROOM } = require('../util/msg');
const SETTINGS_ROLES = ['killer', 'doctor', 'cop', 'nitwit', 'cabby', 'sniper'];

class Room {
  constructor() {
    const id = randomize('A', 5);
    this.id = id;
    this.players = [];
    this.host = null;
    this.game = null;
    this.settings = {
      auto: true,
      killer: 1,
      doctor: 0,
      cop: 0,
      nitwit: 0,
      cabby: 0,
      sniper: 0,
    };
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
      global.USERS[this.host].comm(ROOM.SETTINGS.RECEIVE, this.settings);
    }

    user.comm(ROOM.LEAVE);

    if (
      this.game &&
      !this.game.end_result &&
      !this.game.players[user.id].isDead
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
    if (!this.settings.auto) {
      const min = SETTINGS_ROLES.reduce(
        (acc, role) => acc + this.settings[role],
        0
      );
      if (this.players.length < min)
        throw new Error(`Minimum ${min} players required to start the game`);
    }
    if (this.players.find(({ isReady }) => !isReady))
      throw new Error('Not everyone is ready');

    this.game = new Game(this);
    this.players = this.players.map((player) => ({
      ...player,
      isReady: false,
    }));
    this.game.start();
    this.commAll(ROOM.UPDATE, this.getPlayers());
  }

  setSettings(settings, user) {
    if (this.host !== user.id) throw new Error('User is not a host');
    const { auto } = settings;
    if (auto) {
      if (this.settings.auto) return;
      this.settings.auto = true;
      user.comm(ROOM.SETTINGS.RECEIVE, { auto: this.settings.auto });
    }

    let min = 0;
    for (let role of SETTINGS_ROLES) {
      if (isNaN(settings[role])) return;
      if (settings[role] > 10) return;
      min += settings[role];
    }
    if (min > 20) return;

    this.settings.auto = false;
    SETTINGS_ROLES.forEach((role) => (this.settings[role] = settings[role]));
    user.comm(ROOM.SETTINGS.RECEIVE, this.settings);
  }
}

module.exports = Room;
