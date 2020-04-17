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
    this.roundStart();
  }

  async roundStart() {
    this.round += 1;
    this.forEach(({ socket }) => socket.comm(GAME.SLEEP));
    await wait(5000);

    this.roleAction = GAME_ORDER.reduceRight(
      (acc, current) => () => {
        this.wake(current);
        return acc;
      },
      () => this.summary()
    );
    this.roleAction = this.roleAction();
  }

  wake(role) {
    this.current_role = role;
    this.setCurrentHistory();
    const players = Object.entries(this.players).map(([id, { isDead }]) => {
      const { name, emoji } = global.USERS[id];
      return { id, name, emoji, isDead, voted: [] };
    });
    this.forEach(({ socket }) =>
      socket.comm(GAME.WAKE, { players, message: this.getVoteText() })
    );
  }

  getVoteText() {
    if (this.current_role === ROLES.EVERYONE) {
      return `Day ${this.round + 1}`;
    }

    return `Night ${this.round + 1}`;
  }

  vote(voter, voteFor) {
    if (!players[voter]) return;
    if (players[voter].isDead) return;
    const round = this.history[this.round];
    if (!round) return;
    const voting = round[this.current_role];
    if (!voting) return;

    const vote = voting.vote(voter, voteFor);
    if (!vote) return;
    const { tally, isVoteValid } = vote;
    const list = voting.getList();

    const players = Object.entries(this.players).map(([id, { isDead }]) => {
      const { name, emoji } = global.USERS[id];
      const voted = (list[id] || []).slice(-3).map((id) => ({
        id,
        emoji: global.USERS[id].emoji,
      }));

      return {
        id,
        name,
        emoji,
        isDead,
        voted,
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

        if (this.current_role === ROLES.EVERYONE) {
          return this.reveal();
        }
        this.sleep();
      }, 5000);
    }
  }

  async sleep() {
    this.forEach(({ socket }) => socket.comm(GAME.SLEEP));
    this.roleAction = this.roleAction();
    await wait(5000);
  }

  async summary() {
    await wait(5000);
    // TODO: a function for getting results
    const killed = [this.history[this.round][ROLES.MAFIA].final];
    const killedList = killed.map((id) => ({
      id,
      name: global.USERS[id].name,
      emoji: global.USERS[id].emoji,
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
    const result = this.gameResult();
    if (!result) {
      return this.wake(ROLES.EVERYONE);
    }
    this.forEach(({ socket }) => socket.comm(GAME.END, result), {
      role: ROLES.EVERYONE,
    });
  }

  async reveal() {
    const killed = this.history[this.round][ROLES.EVERYONE].final;
    this.players[killed].isDead = true;
    const { role } = this.players[killed];
    const { name, emoji } = global.USERS[killed];

    global.USERS[killed].comm(GAME.SUMMARY, {
      isKilled: true,
      killedList: [],
    });
    this.forEach(({ socket }) =>
      socket.comm(GAME.REVEAL, { name, emoji, role })
    );

    const result = this.gameResult();
    if (!result) {
      await wait(7500);
      return this.roundStart();
    }
    await wait(7500);
    this.forEach(({ socket }) => socket.comm(GAME.END, result));
  }

  gameResult() {
    let mafiaAlive = false;
    let citizenAlive = false;
    Object.values(this.players).forEach(({ role, isDead }) => {
      mafiaAlive = mafiaAlive || (!isDead && role === ROLES.MAFIA);
      citizenAlive = citizenAlive || (!isDead && role === ROLES.CITIZEN);
    });

    if (mafiaAlive && citizenAlive) return;
    if (mafiaAlive && !citizenAlive) return ROLES.MAFIA;
    if (!mafiaAlive && citizenAlive) return ROLES.CITIZEN;
  }
}

module.exports = Game;

const generateRoles = (count) => {
  const mafia = Math.round(count / 3.5);
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
