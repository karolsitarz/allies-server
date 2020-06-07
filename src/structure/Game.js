const shuffle = require('fisher-yates');
const { GAME } = require('../util/msg');
const Vote = require('./Vote');
const { ROLES, getRoles, getRoleOrder } = require('./Roles');

const { MAFIA, DOCTOR, CITIZEN, COP, EVERYONE } = ROLES;
const TIME = 5000;

const getShuffledPlayers = (players) => {
  const shuffled = shuffle(players);
  const roleCount = getRoles(players.length);

  const playerList = roleCount.reduce((acc, { count, role }) => {
    const mapped = shuffled
      .slice(acc.length, acc.length + count)
      .map(({ id, name, emoji }) => ({ id, name, emoji, role }));
    return [...acc, ...mapped];
  }, []);

  return shuffle(playerList).reduce(
    (acc, { id, ...player }) => ({
      ...acc,
      [id]: { ...player, isDead: false },
    }),
    {}
  );
};
class Game {
  constructor(players) {
    this.players = getShuffledPlayers(players);
    this.gameOrder = getRoleOrder(players.length);

    this.role = EVERYONE;
    this.round = -1;
    this.history = [];

    this.timeout = null;
    this.end_result = null;
    this.is_interrupted = false;
    this.settings = {
      doctor_self: 2,
    };
  }

  wait(time) {
    return new Promise((res) => {
      setTimeout(() => {
        res(this.is_interrupted);
      }, time);
    });
  }

  forEach(callback, { toDead = true, role: toRole = this.role } = {}) {
    Object.entries(this.players).forEach(([id, player]) => {
      const { role, isDead } = player;
      if (!isDead && toRole !== EVERYONE && role !== toRole) return;
      if (!toDead && isDead) return;

      callback({
        ...player,
        id,
        socket: global.USERS[id] || { comm: () => {} },
      });
    });
  }

  async start() {
    this.forEach(({ socket, role: playerRole, id: playerID }) => {
      const players = Object.entries(this.players).map(([id, player]) => {
        const { name, emoji, isDead, isRevealed, role } = player;
        return {
          id,
          name,
          emoji,
          isDead,
          voted: [],
          role:
            (isRevealed ||
              id === playerID ||
              (playerRole !== CITIZEN && playerRole === role)) &&
            role,
        };
      });
      socket.comm(GAME.START, players);
    });

    const shouldEnd = await this.wait(TIME * 2);
    if (shouldEnd) return;
    this.roundStart();
  }

  async roundStart() {
    this.round += 1;
    this.forEach(({ socket }) => socket.comm(GAME.SLEEP));
    const shouldEnd = await this.wait(TIME);
    if (shouldEnd) return;

    this.history[this.round] = this.gameOrder.reduce(
      (acc, current) => ({ ...acc, [current]: null }),
      {}
    );

    this.roleAction = this.gameOrder.reduceRight(
      (acc, current) => () => {
        this.wake(current);
        return acc;
      },
      () => this.summary()
    );
    this.roleAction = this.roleAction();
  }

  async wake(role) {
    this.role = role;

    if (this.role !== EVERYONE) {
      // check if there are any alive with current role
      const aliveRole = Object.values(this.players).find(
        ({ role, isDead }) => !isDead && role === this.role
      );
      // if not, randomize waiting time
      if (!aliveRole) {
        const time = Math.random() * (20 - 7) + 7;
        const shouldEnd = await this.wait(time * 1000);
        if (shouldEnd) return;
        this.roleAction = this.roleAction();
        return;
      }
    }

    const alive = Object.entries(this.players)
      .filter(([, { isDead }]) => !isDead)
      .map(([id]) => id);
    const awake =
      role === EVERYONE
        ? alive
        : alive.filter((id) => this.players[id].role === role);
    this.history[this.round][this.role] = new Vote(
      alive,
      awake,
      this.role === EVERYONE
    );

    const message =
      (this.role === EVERYONE ? 'day' : 'night') + ' ' + (this.round + 1);
    this.forEach(({ socket }) => socket.comm(GAME.WAKE, message));
  }

  vote(voter, voteFor) {
    const { players, settings, end_result, role } = this;
    if (end_result) return;
    if (!players[voter] || players[voter].isDead) return;
    // if a doctor tries to heal a doctor, past the self-heal limit
    if (
      role === DOCTOR &&
      players[voteFor].role === DOCTOR &&
      !settings.doctor_self
    )
      return;
    // if a cop tries to interrogate a cop
    if (role === COP && players[voteFor].role === COP) return;

    const voting = this.history[this.round][this.role];
    if (!voting) return;

    const vote = voting.vote(voter, voteFor);
    if (!vote) return;

    this.forEach(({ socket }) => socket.comm(GAME.VOTE, vote));

    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    if (!vote.isVoteValid) return;
    this.timeout = setTimeout(() => this.endVote(voting), TIME);
  }

  async endVote(voting) {
    const { role, players } = this;
    const votedFor = voting.seal();

    // subtract from the self-heal doctor limit
    if (role === DOCTOR && players[votedFor].role === DOCTOR) {
      this.settings.doctor_self -= 1;
    }

    // reveal the role to the cops
    if (role === COP) {
      this.forEach(
        ({ socket }) => {
          socket.comm(GAME.REVEAL, {
            id: votedFor,
            role: players[votedFor].role === MAFIA && MAFIA,
            isDead: false,
          });
        },
        { role: COP }
      );

      const shouldEnd = await this.wait(TIME);
      if (shouldEnd) return;
    }

    this.timeout = null;
    this.sleep();
  }

  async sleep() {
    if (this.role === EVERYONE) {
      return this.reveal();
    }

    this.forEach(({ socket }) => socket.comm(GAME.SLEEP));
    const shouldEnd = await this.wait(TIME);
    if (shouldEnd) return;
    this.roleAction = this.roleAction();
  }

  async summary() {
    // TODO: a function for getting results
    const round = this.history[this.round];
    let killed = [round[MAFIA].final];

    if (round[DOCTOR]) {
      const healed = round[DOCTOR].final;
      killed = killed.filter((player) => player != healed);
    }

    const revealedRoles = Object.entries(this.players).reduce(
      (acc, [id, { role }]) => ({ ...acc, [id]: role }),
      {}
    );

    killed.forEach((id) => {
      this.players[id].isDead = true;
      if (global.USERS[id])
        global.USERS[id].comm(GAME.SUMMARY, {
          isKilled: true,
          killed,
          players: revealedRoles,
        });
    });

    this.role = EVERYONE;

    this.forEach(({ socket, id }) => {
      if (killed.includes(id)) return;
      socket.comm(GAME.SUMMARY, { isKilled: false, killed });
    });

    const shouldEnd = await this.wait(TIME);
    if (shouldEnd) return;
    if (!this.getResult()) {
      return this.wake(EVERYONE);
    }
    this.forEach(({ socket }) => socket.comm(GAME.END, this.end_result));
  }

  async reveal() {
    const killed = this.history[this.round][EVERYONE].final;
    if (!killed) {
      this.forEach(({ socket }) => socket.comm(GAME.REVEAL, { id: null }));
      const shouldEnd = await this.wait(TIME);
      if (shouldEnd) return;
      return this.roundStart();
    }

    this.players[killed].isDead = true;
    const { role } = this.players[killed];

    const players = Object.entries(this.players).reduce(
      (acc, [id, { role }]) => ({ ...acc, [id]: role }),
      {}
    );
    if (global.USERS[killed])
      global.USERS[killed].comm(GAME.SUMMARY, {
        isKilled: true,
        killed: [killed],
        players,
      });
    this.forEach(({ socket, id }) => {
      if (killed === id) return;
      socket.comm(GAME.REVEAL, { id: killed, role, isDead: true });
    });

    if (!this.getResult()) {
      const shouldEnd = await this.wait(TIME);
      if (shouldEnd) return;
      return this.roundStart();
    }
    const shouldEnd = await this.wait(TIME);
    if (shouldEnd) return;
    this.forEach(({ socket }) => socket.comm(GAME.END, this.end_result));
  }

  getResult() {
    if (this.end_result) return;
    let mafiaAlive = false;
    let citizenAlive = false;
    Object.values(this.players).forEach(({ role, isDead }) => {
      mafiaAlive = mafiaAlive || (!isDead && role === MAFIA);
      citizenAlive = citizenAlive || (!isDead && role !== MAFIA);
    });

    if (mafiaAlive && citizenAlive) return;
    if (mafiaAlive && !citizenAlive) this.end_result = MAFIA;
    else if (!mafiaAlive && citizenAlive) this.end_result = CITIZEN;

    return this.end_result;
  }
}

module.exports = Game;
