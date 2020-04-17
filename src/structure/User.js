const randomize = require('randomatic');
const MSG = require('../util/msg');

class User {
  constructor(socket) {
    const id = randomize('A', 10);
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

    socket.on('message', (connection) => {
      let data;
      try {
        data = JSON.parse(connection);
      } catch (e) {
        console.error('Error receiving socket message.', e.message);
      }

      if (data.message !== message) return;
      try {
        const passed = data.data || {};
        callback(passed);
      } catch ({ message }) {
        this.comm(MSG.INFO, { message });
      }
    });
  }
}

module.exports = User;
