const express = require('express');
const app = express();
require('express-ws')(app);
require('./util/log');
const User = require('./structure/User');

const ipaddress = process.env.IP || require('ip').address() || '127.0.0.1';
const port = process.env.PORT || 443;

global.ROOMS = {};
global.USERS = {};

app.ws('/', socket => {
  const user = new User(socket);
  const { id } = user;
  global.USERS[id] = user;
  console.DLog('CONNECT', id);

  socket.on('close', () => {
    if (id == null) return;
    delete global.USERS[id];
    console.DLog('DISCONNECT', socket.id);
  });
});

// open server
app.listen(port, ipaddress, () =>
  console.log(`server listening on ${ipaddress}:${port}`)
);
