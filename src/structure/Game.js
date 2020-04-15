const shuffle = require('fisher-yates');
const { GAME } = require('../util/msg');
const { wait } = require('../util/async');
const Vote = require('./Vote');

const ROLES = {
  EVERYONE: 'everyone',
  MAFIA: 'mafia',
  CITIZEN: 'citizen',
};

const GAME_ORDER = [ROLES.MAFIA];
class Game {
  constructor(players) {
    const shuffled = shuffle(players);
    const roles = generateRoles(players.length);

    const playerList = roles.reduce((acc, { count, role }) => {
      const mapped = shuffled
        .slice(acc.length, acc.length + count)
        .map((id) => ({
          id,
          role,
        }));
      return [...acc, ...mapped];
    }, []);

    this.players = shuffle(playerList).reduce(
      (acc, { id, role }) => ({ ...acc, [id]: { role, isDead: false } }),
      {}
    );

    this.current_role = ROLES.EVERYONE;
    this.round = -1;
    this.history = [];
    this.timeout = null;
  }

  forEach(callback, { toDead = false, role: toRole = this.current_role } = {}) {
    Object.entries(this.players).forEach(([id, player]) => {
      const { role, isDead } = player;
      if (!toDead && isDead) return;
      if (toRole !== ROLES.EVERYONE && role !== toRole) return;
      callback({ ...player, socket: global.USERS[id] });
    });
  }

  setCurrentHistory() {
    const { round, current_role } = this;
    if (!this.history[round]) this.history[round] = {};
    if (!this.history[round][current_role]) {
      const alive_players = Object.entries(this.players).reduce(
        (acc, [id, { isDead }]) => (isDead ? acc : [...acc, id]),
        []
      );
      const role_players =
        current_role === ROLES.EVERYONE
          ? [...alive_players]
          : alive_players.filter(
              (id) => this.players[id].role === current_role
            );

      this.history[round][current_role] = new Vote(
        alive_players,
        role_players,
        current_role === ROLES.EVERYONE
      );
    }
  }

  async start() {
    this.forEach(({ socket, role }) => socket.comm(GAME.START, role));
    await wait(10000);
    this.nightStart();
  }

  async nightStart() {
    this.round += 1;
    this.forEach(({ socket }) => socket.comm(GAME.SLEEP));
    await wait(5000);

    this.roleAction = GAME_ORDER.reduceRight(
      (acc, current) => () => {
        this.stageAction(current);
        return acc;
      },
      () => this.nightEnd()
    );
    this.roleAction = this.roleAction();
  }

  stageAction(role) {
    this.current_role = role;
    this.setCurrentHistory();
    const players = Object.entries(this.players).map(([id, { isDead }]) => {
      const { name } = global.USERS[id];
      return { id, name, isDead, voted: [] };
    });
    this.forEach(({ socket }) => socket.comm(GAME.WAKE, players));
  }

  vote(voter, voteFor) {
    const round = this.history[this.round];
    if (!round) return;
    const voting = round[this.current_role];
    if (!voting) return;

    const vote = voting.vote(voter, voteFor);
    if (!vote) return;
    const { tally, isVoteValid } = vote;
    const list = voting.getList();
    const players = Object.entries(this.players).map(([id, { isDead }]) => {
      const { name } = global.USERS[id];
      return {
        id,
        name,
        isDead,
        voted: list[id] || [],
        isMostVoted: tally.includes(id),
      };
    });

    this.forEach(({ socket }) =>
      socket.comm(GAME.VOTE, { isVoteValid, players })
    );

    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    if (isVoteValid) {
      this.timeout = setTimeout(() => {
        voting.seal();
        this.timeout = null;

        if (this.current_role === ROLES.EVERYONE) return this.dayEnd();
        this.stageEnd();
      }, 5000);
    }
  }

  stageEnd() {
    this.forEach(({ socket }) => socket.comm(GAME.SLEEP));
    this.roleAction = this.roleAction();
  }

  async nightEnd() {
    // TODO: a function for getting results
    const killed = [this.history[this.round][ROLES.MAFIA].final];
    const killedList = killed.map((id) => ({
      id,
      name: global.USERS[id].name,
    }));

    killed.forEach((id) => {
      this.players[id].isDead = true;
      global.USERS[id].comm(GAME.SUMMARY, { isKilled: true, killedList });
    });

    this.forEach(
      ({ socket }) =>
        socket.comm(GAME.SUMMARY, { isKilled: false, killedList }),
      { role: ROLES.EVERYONE }
    );

    await wait(5000);
    this.stageAction(ROLES.EVERYONE);
  }

  async dayEnd() {
    const killed = this.history[this.round][ROLES.EVERYONE].final;
    this.players[killed].isDead = true;
    const { role } = this.players[killed];
    const name = global.USERS[killed].name;

    global.USERS[killed].comm(GAME.SUMMARY, {
      isKilled: true,
      killedList: [],
    });
    this.forEach(({ socket }) => socket.comm(GAME.REVEAL, { name, role }));

    await wait(5000);
    this.nightStart();
  }
}

module.exports = Game;

const generateRoles = (count) => {
  const mafia = Math.round(count / 2);
  return [
    {
      role: ROLES.MAFIA,
      count: mafia,
    },
    {
      role: ROLES.CITIZEN,
      count: count - mafia,
    },
  ];
};
