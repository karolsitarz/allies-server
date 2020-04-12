const express = require('express');
const app = express();
require('express-ws')(app);
require('./util/log');
const User = require('./structure/User');
const Room = require('./structure/Room');
const MSG = require('./util/msg');

const ipaddress = process.env.IP || require('ip').address() || '127.0.0.1';
const port = process.env.PORT || 443;

global.ROOMS = {};
global.USERS = {};

app.ws('/', socket => {
  const user = new User(socket);
  const { id: uid } = user;
  global.USERS[uid] = user;
  console.DLog('CONNECT', uid);

  socket.on('close', () => {
    if (uid == null) return;
    delete global.USERS[uid];
    console.DLog('DISCONNECT', socket.id);
  });

  user.receive(MSG.LOGIN.PROMPT, name => {
    try {
      if (typeof name !== 'string') throw new Error('Name is not a string.');
      if (name.length > 20) throw new Error('Name is too long.');
      user.name = name;
      user.comm(MSG.LOGIN.SUCCESS);
    } catch (e) {
      user.comm(MSG.LOGIN.FAILURE, e.message);
    }
  });

  user.receive(MSG.ROOM.CREATE, () => {
    const room = new Room();
    const { id } = room;
    global.ROOMS[id] = room;

    room.join(user);
    room.host = uid;
    user.comm(MSG.ROOM.JOIN, {
      id,
      players: room.getPlayers()
    });
  });

  user.receive(MSG.ROOM.JOIN, id => {
    const room = global.ROOMS[id];
    if (!room) return;

    room.join(user);
    user.comm(MSG.ROOM.JOIN, {
      id,
      players: room.getPlayers()
    });
  });

  user.receive(MSG.ROOM.LEAVE, () => {
    const id = user.current_room;
    if (!id) return;
    const room = global.ROOMS[id];
    if (!room) return;

    console.log(user.current_room, '\t', id, '\t', global.ROOMS[id]);
    room.leave(user);
    console.log(user.current_room, '\t', id, '\t', global.ROOMS[id]);
    user.comm(MSG.ROOM.LEAVE);
  });
});

// open server
app.listen(port, ipaddress, () =>
  console.log(`server listening on ${ipaddress}:${port}`)
);
