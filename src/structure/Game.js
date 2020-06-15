const shuffle = require('fisher-yates');
const { GAME } = require('../util/msg');
const Vote = require('./Vote');
const { ROLES, getRoles, getRoleOrder, ROLES_VOTE_SKIP } = require('./Roles');

const SKIP = 'SKIP';
const { KILLER, DOCTOR, CITIZEN, COP, EVERYONE, SNIPER, CABBY } = ROLES;
const TIME = 4000;

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
      doctor_self_heal: 2,
      nitwits_know_each_other: false,
      sniper_shot: 1,
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

    const shouldEnd = await this.wait(TIME * 1.5);
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
        this.roleAction = acc;
      },
      () => this.summary()
    );
    this.roleAction();
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
        return this.roleAction();
      }
    }
    const canSkipVote = ROLES_VOTE_SKIP.includes(role);

    const alive = Object.entries(this.players)
      .filter(([, { isDead }]) => !isDead)
      .map(([id]) => id);
    const awake =
      role === EVERYONE
        ? alive
        : alive.filter((id) => this.players[id].role === role);
    const list = canSkipVote ? [...alive, SKIP] : alive;

    this.history[this.round][this.role] = new Vote(
      list,
      awake,
      this.role === EVERYONE
    );

    const message =
      (this.role === EVERYONE ? 'day' : 'night') + ' ' + (this.round + 1);

    this.forEach(({ socket }) =>
      socket.comm(GAME.WAKE, { message, canSkipVote })
    );
  }

  vote(voter, voteFor) {
    const { players, settings, end_result, role } = this;
    if (end_result !== null) return;
    if (!players[voter] || players[voter].isDead) return;
    // if can't skip and wants to skip
    if (!ROLES_VOTE_SKIP.includes(role) && voteFor === SKIP) return;
    // if a doctor tries to heal a doctor, past the self-heal limit
    if (
      role === DOCTOR &&
      players[voteFor].role === DOCTOR &&
      !settings.doctor_self_heal
    )
      return;
    // if a cop tries to interrogate a cop
    if (role === COP && players[voteFor].role === COP) return;
    // if a sniper tries to shoot a sniper
    if (role === SNIPER && voteFor !== SKIP && players[voteFor].role === SNIPER)
      return;

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
      this.settings.doctor_self_heal -= 1;
    }

    // reveal the role to the cops
    if (role === COP) {
      this.forEach(
        ({ socket }) => {
          socket.comm(GAME.REVEAL, {
            id: votedFor,
            role: players[votedFor].role === KILLER && KILLER,
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
    this.roleAction();
  }

  getFatalities() {
    const round = this.history[this.round];
    const killed = round[KILLER].final;
    const healed = round[DOCTOR] && round[DOCTOR].final;
    const sniped = round[SNIPER] && round[SNIPER].final;

    // add mafia killed to fatalities
    let fatalities = [killed];

    // if sniped wasn't healed, add fatalities
    if (sniped && sniped !== SKIP && sniped !== healed) {
      fatalities = [...fatalities, sniped];
      if (this.players[sniped].role !== KILLER) {
        const snipers = Object.entries(this.players)
          .filter(([, { role, isDead }]) => !isDead && role === SNIPER)
          .map(([id]) => id);
        fatalities = [...fatalities, ...snipers];
      }
    }

    // heal fatalities
    fatalities = fatalities.filter((player) => player !== healed);
    return [...new Set(fatalities)];
  }

  async summary() {
    const killed = this.getFatalities();

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
    if (this.getResult() === null) {
      return this.wake(EVERYONE);
    }
    this.forEach(({ socket }) => socket.comm(GAME.END, this.end_result));
  }

  async reveal() {
    const killed = this.history[this.round][EVERYONE].final;
    // if no one was killed
    if (!killed) {
      this.forEach(({ socket }) => socket.comm(GAME.REVEAL, { id: null }));
      const shouldEnd = await this.wait(TIME);
      if (shouldEnd) return;
      return this.roundStart();
    }

    // kill the player
    this.players[killed].isDead = true;
    const { role } = this.players[killed];

    // show killed players all the roles
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
    // reveal killed players' role
    this.forEach(({ socket, id }) => {
      if (killed === id) return;
      socket.comm(GAME.REVEAL, { id: killed, role, isDead: true });
    });

    const shouldEnd = await this.wait(TIME);
    if (shouldEnd) return;

    // if the game's over, end it
    if (this.getResult() !== null) {
      this.forEach(({ socket }) => socket.comm(GAME.END, this.end_result));
      return;
    }
    // continue
    this.roundStart();
  }

  getResult() {
    if (this.end_result !== null) return this.end_result;
    const alive = Object.values(this.players).filter(({ isDead }) => !isDead);
    const killerAlive = alive.find(({ role }) => role === KILLER);
    const citizenAlive = alive.find(({ role }) => role !== KILLER);

    if (killerAlive && citizenAlive) {
      // if two players - mafia and cabby => tie
      if (alive.length !== 2) return this.end_result;
      if (!alive.find(({ role }) => role === CABBY)) return this.end_result;
      this.end_result = 0;
      return this.end_result;
    }

    if (killerAlive && !citizenAlive) this.end_result = -1;
    else if (!killerAlive && citizenAlive) this.end_result = 1;
    else if (!killerAlive && !citizenAlive) this.end_result = 0;

    return this.end_result;
  }
}

module.exports = Game;
