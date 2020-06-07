const ROLES = {
  EVERYONE: 'everyone',
  MAFIA: 'mafia',
  DOCTOR: 'doctor',
  COP: 'cop',
  CITIZEN: 'citizen',
};
const { MAFIA, DOCTOR, CITIZEN, COP } = ROLES;
const ROLES_ORDER = [MAFIA, COP, DOCTOR];

const ROLE_WEIGHTS = {
  [MAFIA]: {
    priority: 5,
    gain: 1.1,
  },
  [DOCTOR]: {
    priority: 11,
    gain: 1.1,
  },
  [COP]: {
    priority: 12,
    gain: 1.1,
  },
};

const getRoleCount = (role, count) =>
  Math.round(
    Math.pow(count, ROLE_WEIGHTS[role].gain) / ROLE_WEIGHTS[role].priority
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
  );

module.exports.ROLES = ROLES;
module.exports.getRoles = getRoles;
module.exports.getRoleOrder = getRoleOrder;
