const randomize = require('randomatic');

class User {
  constructor(socket) {
    const id = randomize('A0', 10);
    this.id = id;
    this.socket = socket;
    this.name = null;
    this.current_room = null;
  }

  comm(message, data) {
    if (typeof message !== 'string') return;
    const { socket } = this;
    try {
      const parsed = JSON.stringify({ message, data });
      socket.send(parsed);
    } catch (e) {
      console.error('Error parsing socket message.', e.message);
    }
  }

  receive(message, callback) {
    if (typeof message !== 'string') return;
    if (typeof callback !== 'function') return;
    const { socket } = this;

    socket.on('message', connection => {
      let data;
      try {
        data = JSON.parse(connection);
      } catch (e) {
        console.error('Error receiving socket message.', e.message);
      }

      if (data.message !== message) return;
      callback(data.data);
    });
  }
}

module.exports = User;
