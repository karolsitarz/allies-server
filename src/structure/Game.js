const shuffle = require('fisher-yates');
const shuffleInplace = require('fisher-yates/inplace');
const { GAME } = require('../util/msg');
const { wait } = require('../util/async');
const Vote = require('./Vote');

const ROLES = {
  MAFIA: 'mafia',
  CITIZEN: 'citizen'
};

class Game {
  constructor(players) {
    const shuffled = shuffle(players);
    const roles = generateRoles(shuffled.length);

    this.players = roles.reduce((acc, current) => {
      const { count, role } = current;
      const mapped = shuffled.slice(acc.length, acc.length + count).map(p => ({
        id: p,
        role,
        isDead: false
      }));
      return [...acc, ...mapped];
    }, []);
    shuffleInplace(this.players);

    this.current_role = null;
    this.round = 0;
    this.history = [];
  }

  start() {
    this.players.forEach(({ id, role }) => {
      global.USERS[id].comm(GAME.START, role);
    });
    this.night();
  }

  async night() {
    await wait(1000);
    this.history[this.round] = {};
    this.players.forEach(({ id, isDead }) => {
      if (isDead) return;
      global.USERS[id].comm(GAME.NIGHT.START);
    });

    await wait(1000);

    this.current_role = ROLES.MAFIA;
    const players = this.players.map(({ id, isDead }) => {
      const { name } = global.USERS[id];
      return { id, isDead, name, voted: [] };
    });
    this.history[this.round][this.current_role] = new Vote(
      this.players,
      this.players.filter(c => c.role === this.current_role)
    );
    this.players.forEach(({ id, role, isDead }) => {
      if (isDead) return;
      if (role !== this.current_role) return;
      global.USERS[id].comm(GAME.ROLE.START, players);
    });
  }

  vote(voter, voteFor) {
    const round = this.history[this.round];
    if (!round) return;
    const voting = round[this.current_role];
    if (!voting) return;

    const { tally, isAllVoted } = voting.vote(voter, voteFor);
    const list = voting.getList();
    const players = this.players.map(({ id, isDead }) => {
      const { name } = global.USERS[id];
      return {
        id,
        isDead,
        name,
        voted: list[id] || [],
        isMostVoted: tally.includes(id)
      };
    });
    this.players.forEach(({ id, role, isDead }) => {
      if (isDead) return;
      if (this.current_role && role !== this.current_role) return;
      global.USERS[id].comm(GAME.ROLE.VOTE, { isAllVoted, players });
    });
  }
}

module.exports = Game;

const generateRoles = count => {
  const mafia = Math.round(count / 2);
  return [
    {
      role: ROLES.MAFIA,
      count: mafia
    },
    {
      role: ROLES.CITIZEN,
      count: count - mafia
    }
  ];
};
