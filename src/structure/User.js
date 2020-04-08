const randomize = require('randomatic');

class User {
  constructor(socket) {
    const id = randomize('A0', 10);
    this.id = id;
    this.socket = socket;
    this.current_room = null;
  }

  comm(message, data) {
    if (typeof message !== 'string') return;
    const { socket } = this;
    try {
      const parsed = JSON.stringify({ message, data });
      socket.send(parsed);
    } catch {
      console.error('Error parsing socket message.');
    }
  }

  receive(message, callback) {
    if (typeof message !== 'string') return;
    if (typeof callback !== 'function') return;
    const { socket } = this;

    socket.on('message', connection => {
      try {
        const data = JSON.parse(connection);
        if (data.message !== message) return;
        callback(data.data);
      } catch {
        console.error('Error receiving socket message.');
      }
    });
  }
}

module.exports = User;
