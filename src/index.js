const express = require('express');
const app = express();
require('express-ws')(app);
const emojiRegex = require('emoji-regex');

require('./util/log');
const User = require('./structure/User');
const Room = require('./structure/Room');
const MSG = require('./util/msg');

const port = process.env.PORT || 443;

global.ROOMS = {};
global.USERS = {};

app.ws('/', (socket) => {
  const user = new User(socket);
  const { id: uid } = user;
  global.USERS[uid] = user;
  console.DLog('CONNECT', uid);

  socket.on('close', () => {
    if (uid == null) return;
    if (user.current_room) {
      const room = global.ROOMS[user.current_room];
      room.leave(user);
    }
    delete global.USERS[uid];
    console.DLog('DISCONNECT', uid);
  });

  user.receive(MSG.CONNECTION.PING, (ping) => {
    user.comm(MSG.CONNECTION.PONG, ping);
  });

  user.receive(MSG.LOGIN.PROMPT, ({ name, emoji }) => {
    try {
      if (user.name) throw new Error('User already logged in.');
      if (typeof name !== 'string') throw new Error('Name is not a string.');
      if (!name.length) throw new Error('Name is too short.');
      if (name.length > 20) throw new Error('Name is too long.');
      const regex = emojiRegex().test(emoji);
      if (!regex) throw new Error('Invalid emoji.');
    } catch ({ message }) {
      user.comm(MSG.INFO, { message });
    }

    user.name = name;
    user.emoji = emoji;
    user.comm(MSG.LOGIN.SUCCESS, uid);
  });

  user.receive(MSG.ROOM.CREATE, () => {
    try {
      if (user.current_room) throw new Error('User is already in a room');
    } catch ({ message }) {
      user.comm(MSG.INFO, { message });
    }

    const room = new Room();
    const { id } = room;
    room.host = uid;
    global.ROOMS[id] = room;

    room.join(user);
  });

  user.receive(MSG.ROOM.JOIN, (id) => {
    const room = global.ROOMS[id];
    try {
      if (!room) throw new Error('Room does not exist.');
    } catch ({ message }) {
      user.comm(MSG.INFO, { message });
    }

    room.join(user);
  });

  user.receive(MSG.ROOM.READY, () => {
    let room;
    try {
      if (!user.current_room) throw new Error('User is not in a room.');
      room = global.ROOMS[user.current_room];
      if (!room) throw new Error('User is not in a valid room.');
    } catch ({ message }) {
      user.comm(MSG.INFO, { message });
    }

    room && room.toggleReady(user);
  });

  user.receive(MSG.ROOM.LEAVE, () => {
    let room;
    try {
      if (!user.current_room) throw new Error('User is not in a room.');
      room = global.ROOMS[user.current_room];
      if (!room) {
        user.current_room = null;
        throw new Error('The room does not exist.');
      }
    } catch ({ message }) {
      user.comm(MSG.INFO, { message });
    }

    room && room.leave(user);
  });

  user.receive(MSG.ROOM.SETTINGS.SEND, (settings) => {
    let room;
    try {
      if (!user.current_room) throw new Error('User is not in any room');
      room = global.ROOMS[user.current_room];
      if (!room) throw new Error('User is not in a valid room');
    } catch ({ message }) {
      user.comm(MSG.INFO, { message });
    }

    room && room.setSettings(settings, user);
  });

  user.receive(MSG.GAME.START, () => {
    let room;
    try {
      if (!user.current_room) throw new Error('User is not in any room');
      room = global.ROOMS[user.current_room];
      if (!room) throw new Error('User is not in a valid room');
    } catch ({ message }) {
      user.comm(MSG.INFO, { message });
    }

    room && room.startGame(user);
  });

  user.receive(MSG.GAME.VOTE, (id) => {
    let game;
    try {
      if (!user.current_room) throw new Error('User is not in any room');
      const room = global.ROOMS[user.current_room];
      if (!room) throw new Error('User is not in a valid room');
      game = room.game;
      if (!game) throw new Error('User is not in a valid game');
    } catch ({ message }) {
      user.comm(MSG.INFO, { message });
    }

    game && game.vote(user.id, id);
  });
});

// open server
app.listen(port, () => console.log(`server listening on port ${port}`));
