const shuffle = require('fisher-yates');
const { GAME } = require('../util/msg');
const Vote = require('./Vote');

const ROLES = {
  EVERYONE: 'everyone',
  MAFIA: 'mafia',
  DOCTOR: 'doctor',
  CITIZEN: 'citizen',
};

const TIME = 5000;

const ROLES_ORDER = [ROLES.MAFIA, ROLES.DOCTOR];

const getShuffledPlayers = (players) => {
  const shuffled = shuffle(players);
  const { roleCount } = generateRoles(players.length);

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
    this.gameOrder = generateRoles(players.length).roleOrder;
    this.current_role = ROLES.EVERYONE;
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

  forEach(callback, { toDead = true, role: toRole = this.current_role } = {}) {
    Object.entries(this.players).forEach(([id, player]) => {
      const { role, isDead } = player;
      if (!isDead && toRole !== ROLES.EVERYONE && role !== toRole) return;
      if (!toDead && isDead) return;

      callback({
        ...player,
        id,
        socket: global.USERS[id] || { comm: () => {} },
      });
    });
  }

  setCurrentHistory() {
    const { round, current_role } = this;
    if (!this.history[round]) this.history[round] = {};
    if (this.history[round][current_role]) return;

    const alive_players = Object.entries(this.players).reduce(
      (acc, [id, { isDead }]) => (isDead ? acc : [...acc, id]),
      []
    );
    const role_players =
      current_role === ROLES.EVERYONE
        ? [...alive_players]
        : alive_players.filter((id) => this.players[id].role === current_role);

    this.history[round][current_role] = new Vote(
      alive_players,
      role_players,
      current_role === ROLES.EVERYONE
    );
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
              (playerRole !== ROLES.CITIZEN && playerRole === role)) &&
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
    this.current_role = role;
    this.setCurrentHistory();

    if (this.current_role !== ROLES.EVERYONE) {
      const aliveRole = Object.values(this.players).find(
        ({ role, isDead }) => !isDead && role === this.current_role
      );
      if (!aliveRole) {
        const time = Math.random() * (20 - 7) + 7;
        const shouldEnd = await this.wait(time * 1000);
        if (shouldEnd) return;
        this.roleAction = this.roleAction();
        return;
      }
    }

    const message = this.getVoteText();
    this.forEach(({ socket }) => socket.comm(GAME.WAKE, message));
  }

  getVoteText() {
    if (this.current_role === ROLES.EVERYONE) {
      return `day ${this.round + 1}`;
    }

    return `night ${this.round + 1}`;
  }

  vote(voter, voteFor) {
    const { players, settings, end_result, current_role } = this;
    if (!players[voter]) return;
    if (players[voter].isDead) return;
    if (end_result) return;
    if (
      current_role === ROLES.DOCTOR &&
      players[voteFor].role === ROLES.DOCTOR &&
      !settings.doctor_self
    )
      return;

    const round = this.history[this.round];
    if (!round) return;
    const voting = round[this.current_role];
    if (!voting) return;

    const vote = voting.vote(voter, voteFor);
    if (!vote) return;
    const { tally, isVoteValid } = vote;
    const list = voting.list;

    const voted = Object.keys(players).map((id) => (list[id] || []).slice(-3));

    this.forEach(({ socket }) =>
      socket.comm(GAME.VOTE, { isVoteValid, voted, tally })
    );

    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    if (isVoteValid) {
      this.timeout = setTimeout(() => {
        voting.seal();
        const votedFor = voting.final;
        if (
          this.current_role === ROLES.DOCTOR &&
          votedFor &&
          this.players[votedFor].role === ROLES.DOCTOR
        ) {
          this.settings.doctor_self -= 1;
        }
        this.timeout = null;
        this.sleep();
      }, TIME);
    }
  }

  async sleep() {
    if (this.current_role === ROLES.EVERYONE) {
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
    let killed = [round[ROLES.MAFIA].final];

    if (round[ROLES.DOCTOR]) {
      const healed = round[ROLES.DOCTOR].final;
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

    this.forEach(
      ({ socket, id }) => {
        if (killed.includes(id)) return;
        socket.comm(GAME.SUMMARY, { isKilled: false, killed });
      },
      { role: ROLES.EVERYONE }
    );

    const shouldEnd = await this.wait(TIME);
    if (shouldEnd) return;
    if (!this.getResult()) {
      return this.wake(ROLES.EVERYONE);
    }
    this.forEach(({ socket }) => socket.comm(GAME.END, this.end_result), {
      role: ROLES.EVERYONE,
    });
  }

  async reveal() {
    const killed = this.history[this.round][ROLES.EVERYONE].final;
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
      socket.comm(GAME.REVEAL, { id: killed, role });
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
      mafiaAlive = mafiaAlive || (!isDead && role === ROLES.MAFIA);
      citizenAlive = citizenAlive || (!isDead && role === ROLES.CITIZEN);
    });

    if (mafiaAlive && citizenAlive) return;
    if (mafiaAlive && !citizenAlive) this.end_result = ROLES.MAFIA;
    else if (!mafiaAlive && citizenAlive) this.end_result = ROLES.CITIZEN;

    return this.end_result;
  }
}

module.exports = Game;
module.exports.roles = ROLES;

const generateRoles = (count) => {
  const roleWeights = {
    [ROLES.MAFIA]: {
      priority: 5,
      gain: 1.1,
    },
    [ROLES.DOCTOR]: {
      priority: 11,
      gain: 1.1,
    },
  };
  const getCount = (role) =>
    Math.round(
      Math.pow(count, roleWeights[role].gain) / roleWeights[role].priority
    );

  const { roleCount, roleOrder, citizenCount } = ROLES_ORDER.reduce(
    (acc, role) => {
      const count = getCount(role);
      if (!count) return acc;

      const { roleCount, roleOrder, citizenCount } = acc;
      return {
        roleCount: [...roleCount, { role, count }],
        roleOrder: [...roleOrder, role],
        citizenCount: citizenCount - count,
      };
    },
    {
      roleCount: [],
      roleOrder: [],
      citizenCount: count,
    }
  );

  return {
    roleOrder,
    roleCount: [
      ...roleCount,
      {
        role: ROLES.CITIZEN,
        count: citizenCount,
      },
    ],
  };
};
