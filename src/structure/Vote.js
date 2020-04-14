class Vote {
  constructor(list, voters) {
    this.voters = voters.reduce((acc, current) => {
      const { id } = current;
      return { ...acc, [id]: null };
    }, {});
    this.list = list.reduce((acc, current) => {
      const { id } = current;
      return { ...acc, [id]: [] };
    }, {});

    this.voters._length = voters.length;
    this.final = null;
  }
  vote(voter, voteFor) {
    if (!this.final);
    if (!this.list.hasOwnProperty(voteFor)) return;
    if (!this.voters.hasOwnProperty(voter)) return;

    // remove previous vote
    const lastVote = this.voters[voter];
    if (lastVote) {
      this.list[lastVote] = this.list[lastVote].filter(el => el !== voter);
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
    const { tally, voteCount } = Object.keys(this.list).reduce(
      (acc, current) => {
        const count = this.list[current].length;
        const { maxCount, tally } = acc;
        const voteCount = acc.voteCount + count;
        if (count < maxCount) return { ...acc, voteCount };
        if (count === maxCount)
          return { maxCount, voteCount, tally: [...tally, current] };
        return { voteCount, maxCount: count, tally: [current] };
      },
      { maxCount: 0, tally: [], voteCount: 0 }
    );
    return {
      tally,
      isAllVoted: voteCount === this.voters._length
    };
  }

  seal() {
    const { tally, isAllVoted } = this.getTally();
    if (!isAllVoted) return;
    const i = Math.floor(Math.random() * tally.length);
    this.final = tally[i];
    return this.final;
  }

  getList() {
    return this.list;
  }
}

module.exports = Vote;
