class Vote {
  constructor(list, voters, unanimous = false) {
    this.voters = voters.reduce((acc, id) => ({ ...acc, [id]: null }), {});
    this.list = list.reduce((acc, id) => ({ ...acc, [id]: [] }), {});

    this.voters._length = voters.length;
    this.final = null;
    this.unanimous = unanimous;
  }
  vote(voter, voteFor) {
    if (this.final) return;
    if (!this.list.hasOwnProperty(voteFor)) return;
    if (!this.voters.hasOwnProperty(voter)) return;

    // remove previous vote
    const lastVote = this.voters[voter];
    if (lastVote) {
      this.list[lastVote] = this.list[lastVote].filter((el) => el !== voter);
    }

    // toggle vote off
    if (lastVote === voteFor) {
      this.voters[voter] = null;
      return this.getTally();
    }

    // add new vote
    this.voters[voter] = voteFor;
    if (!this.list[voteFor].includes(voter)) {
      this.list[voteFor].push(voter);
    }
    return this.getTally();
  }

  getTally() {
    let mostVotes = 0;
    let tally = [];
    let voteCount = 0;
    Object.keys(this.list).forEach((current) => {
      const count = this.list[current].length;
      voteCount += count;

      if (count < mostVotes) return;
      if (count === mostVotes) {
        tally = [...tally, current];
        return;
      }
      mostVotes = count;
      tally = [current];
    });

    const voted = Object.entries(this.list).reduce(
      (acc, [id, list]) => ({
        ...acc,
        [id]: list.slice(-3),
      }),
      {}
    );

    if (!mostVotes)
      return {
        tally: [],
        isVoteValid: false,
        voted,
      };

    return {
      tally: this.unanimous && tally.length > 1 ? [] : tally,
      isVoteValid: voteCount === this.voters._length,
      voted,
    };
  }

  seal() {
    const { tally } = this.getTally();
    const i = Math.floor(Math.random() * tally.length);
    this.final = tally[i] || null;
    return this.final;
  }
}

module.exports = Vote;
