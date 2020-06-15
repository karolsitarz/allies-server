const ROLES = {
  EVERYONE: 'everyone',
  KILLER: 'killer',
  DOCTOR: 'doctor',
  COP: 'cop',
  CITIZEN: 'citizen',
  NITWIT: 'nitwit',
  CABBY: 'cabby',
  SNIPER: 'sniper',
};
const { KILLER, DOCTOR, CITIZEN, COP, NITWIT, CABBY, SNIPER } = ROLES;
const ROLES_ORDER = [KILLER, COP, DOCTOR, SNIPER, NITWIT];
const ROLES_VOTE_SKIP = [SNIPER, NITWIT];

const ROLE_WEIGHTS = {
  [KILLER]: {
    priority: 4.5,
    gain: 1.1,
  },
  [DOCTOR]: {
    priority: 9,
    gain: 1,
  },
  [COP]: {
    priority: 9.5,
    gain: 1.1,
  },
  [NITWIT]: {
    priority: 10,
    gain: 1.75,
  },
  [CABBY]: {
    priority: 15,
    gain: 1.1,
  },
  [SNIPER]: {
    priority: 13,
    gain: 1.75,
  },
};

const getRoleCount = (role, count) =>
  Math.round(
    Math.pow(count / ROLE_WEIGHTS[role].priority, ROLE_WEIGHTS[role].gain)
  );

const getRoles = (count) => {
  let roles = [];
  let citizenCount = count;
  ROLES_ORDER.forEach((role) => {
    const roleCount = getRoleCount(role, count);
    if (roleCount) {
      roles = [...roles, { role, count: roleCount }];
      citizenCount -= roleCount;
    }
  });

  return [
    ...roles,
    {
      role: CITIZEN,
      count: citizenCount,
    },
  ];
};

const getRoleOrder = (count) =>
  ROLES_ORDER.reduce(
    (acc, role) => (!getRoleCount(role, count) ? acc : [...acc, role]),
    []
  ).filter((role) => role !== NITWIT);

module.exports.ROLES = ROLES;
module.exports.getRoles = getRoles;
module.exports.getRoleOrder = getRoleOrder;
module.exports.ROLES_VOTE_SKIP = ROLES_VOTE_SKIP;
