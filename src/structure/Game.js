const shuffle = require('fisher-yates');
const shuffleInplace = require('fisher-yates/inplace');
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

    this.current_role = ROLES.EVERYONE;
    this.round = -1;
    this.history = [];
    this.timeout = null;

    this.roleAction = null;
  }

  forEach(callback, { toDead = false, role: toRole = this.current_role } = {}) {
    this.players.forEach((player) => {
      const { id, role, isDead } = player;
      if (!toDead && isDead) return;
      if (toRole !== ROLES.EVERYONE && role !== toRole) return;
      callback({ ...player, socket: global.USERS[id] });
    });
  }

  setCurrentHistory() {
    const { round, current_role, players } = this;
    if (!this.history[round]) this.history[round] = {};
    if (!this.history[round][current_role]) {
      const alivePlayers = players.filter(({ isDead }) => !isDead);
      const rolePlayers = alivePlayers.filter(
        ({ role }) => current_role === ROLES.EVERYONE || role === current_role
      );
      this.history[round][current_role] = new Vote(
        alivePlayers,
        rolePlayers,
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
    this.forEach(({ socket }) => socket.comm(GAME.NIGHT.START));
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
    const players = this.players.map(({ id, isDead }) => {
      const { name } = global.USERS[id];
      return { id, isDead, name, voted: [] };
    });
    this.forEach(({ socket }) => socket.comm(GAME.STAGE.START, players));
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
      socket.comm(GAME.STAGE.VOTE, { isVoteValid, players })
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
    this.forEach(({ socket }) => socket.comm(GAME.STAGE.END));
    this.roleAction = this.roleAction();
  }

  async nightEnd() {
    // TODO: a function for getting results
    const killed = [this.history[this.round][ROLES.MAFIA].final];
    const killedList = killed.map((id) => ({
      id,
      name: global.USERS[id].name,
    }));

    this.players = this.players.map((player) => {
      const { id, isDead } = player;
      const isKilled = killed.includes(id);
      return {
        ...player,
        isDead: isDead || isKilled,
      };
    });

    killed.forEach((id) =>
      global.USERS[id].comm(GAME.NIGHT.END, { isKilled: true, killedList })
    );
    this.forEach(
      ({ socket }) =>
        socket.comm(GAME.NIGHT.END, { isKilled: false, killedList }),
      { role: ROLES.EVERYONE }
    );

    await wait(5000);
    this.stageAction(ROLES.EVERYONE);
  }

  async dayEnd() {
    const killed = this.history[this.round][ROLES.EVERYONE].final;
    this.players = this.players.map((player) => {
      const { id, isDead } = player;
      const isKilled = id === killed;
      return {
        ...player,
        isDead: isDead || isKilled,
      };
    });
    const { role } = this.players.find(({ id }) => id === killed);
    const name = global.USERS[killed].name;

    global.USERS[killed].comm(GAME.NIGHT.END, {
      isKilled: true,
      killedList: [],
    });
    this.forEach(({ socket }) => socket.comm(GAME.DAY.END, { name, role }));

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
