const randomize = require('randomatic');

class Room {
  players = [];

  constructor() {
    const id = randomize('A0', 10);
    this.id = id;
  }

  commAll(message, data) {
    this.players.forEach(uid => {
      global.USERS[uid].comm(message, data);
    })
  }

  join(socket) {
    if (socket.current_room) return;
    if (this.players.includes(socket.id)) return;
    this.players.append(socket.id);
  }

  leave(socket) {
    if (socket.current_room != id) return;
    this.players = this.players.filter(s => s !== socket.id);
  }
}

module.exports = Room;
