const MSG = {
  LOGIN: {
    PROMPT: 'LOGIN_PROMPT',
    SUCCESS: 'LOGIN_SUCCESS',
    FAILURE: 'LOGIN_FAILURE',
  },
  ROOM: {
    CREATE: 'ROOM_CREATE',
    JOIN: 'ROOM_JOIN',
    LEAVE: 'ROOM_LEAVE',
    UPDATE: 'ROOM_UPDATE',
  },
  GAME: {
    START: 'GAME_START',
    END: 'GAME_END',
    STAGE: {
      START: 'STAGE_START',
      VOTE: 'STAGE_VOTE',
      END: 'STAGE_END',
    },
    NIGHT: {
      START: 'NIGHT_START',
      END: 'NIGHT_END',
    },
    DAY: {
      START: 'DAY_START',
      END: 'DAY_END',
    },
  },
};

module.exports = MSG;
