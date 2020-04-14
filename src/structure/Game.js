const shuffle = require('fisher-yates');
const shuffleInplace = require('fisher-yates/inplace');
const { GAME } = require('../util/msg');
const { wait } = require('../util/async');
const Vote = require('./Vote');

const ROLES = {
  MAFIA: 'mafia',
  CITIZEN: 'citizen',
};

const GAME_ORDER = [ROLES.MAFIA];
class Game {
  constructor(players) {
    const shuffled = shuffle(players);
    const roles = generateRoles(shuffled.length);

    this.players = roles.reduce((acc, current) => {
      const { count, role } = current;
      const mapped = shuffled
        .slice(acc.length, acc.length + count)
        .map((p) => ({
          id: p,
          role,
          isDead: false,
        }));
      return [...acc, ...mapped];
    }, []);
    shuffleInplace(this.players);

    this.current_role = null;
    this.round = 0;
    this.history = [];
    this.timeout = null;

    this.roleAction = GAME_ORDER.reduceRight(
      (acc, current) => () => {
        this.nightMove(current);
        return acc;
      },
      () => this.nightEnd()
    );
  }

  forEach(callback, { toDead = false, role: toRole = this.current_role } = {}) {
    this.players.forEach((player) => {
      const { id, role, isDead } = player;
      if (!toDead && isDead) return;
      if (toRole && role !== toRole) return;
      callback({ ...player, socket: global.USERS[id] });
    });
  }

  setCurrentHistory() {
    const { round, current_role, players } = this;
    if (!this.history[round]) this.history[round] = {};
    if (!this.history[round][current_role]) {
      const alivePlayers = players.filter(({ isDead }) => !isDead);
      const rolePlayers = alivePlayers.filter(
        ({ role }) => role === current_role
      );
      this.history[round][current_role] = new Vote(alivePlayers, rolePlayers);
    }
  }

  async start() {
    this.forEach(({ socket, role }) => socket.comm(GAME.START, role));
    await wait(10000);
    this.forEach(({ socket }) => socket.comm(GAME.NIGHT.START));
    await wait(5000);
    this.roleAction = this.roleAction();
  }

  nightMove(role) {
    this.current_role = role;
    this.setCurrentHistory();
    const players = this.players.map(({ id, isDead }) => {
      const { name } = global.USERS[id];
      return { id, isDead, name, voted: [] };
    });
    this.forEach(({ socket }) => socket.comm(GAME.ROLE.START, players));
  }

  async nightEnd() {
    // here will be a function for getting results
    const killed = [this.history[this.round][ROLES.MAFIA].final];

    this.players = this.players.map((player) => {
      const { id, isDead } = player;
      const isKilled = killed.includes(id);
      return {
        ...player,
        isDead: isDead || isKilled,
      };
    });

    this.current_role = null;
    this.forEach(({ socket }) => socket.comm(GAME.NIGHT.END));

    // await wait(10000);
    // this.forEach(({ socket }) => socket.comm(GAME.DAY.START));
  }

  vote(voter, voteFor) {
    const round = this.history[this.round];
    if (!round) return;
    const voting = round[this.current_role];
    if (!voting) return;

    const { tally, isVoteValid } = voting.vote(voter, voteFor);
    const list = voting.getList();
    const players = this.players.map(({ id, isDead }) => {
      const { name } = global.USERS[id];
      return {
        id,
        isDead,
        name,
        voted: list[id] || [],
        isMostVoted: tally.includes(id),
      };
    });

    this.forEach(({ socket }) =>
      socket.comm(GAME.ROLE.VOTE, { isVoteValid, players })
    );

    if (isVoteValid) {
      this.timeout = setTimeout(() => {
        voting.seal();
        this.timeout = null;

        this.forEach(({ socket }) => socket.comm(GAME.ROLE.END));
        this.roleAction = this.roleAction();
      }, 5000);
      return;
    }
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
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
