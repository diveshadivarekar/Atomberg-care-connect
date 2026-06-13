const store = {
  sessions: [],
  invites: [],
  participants: [],
  chat_messages: [],
  recordings: [],
  events: []
};

module.exports = {
  exec() {},

  prepare(sql) {
    return {
      run(...args) {
        console.log('[MOCK RUN]', sql, args);
        return { changes: 1 };
      },

      get(...args) {
        console.log('[MOCK GET]', sql, args);

        if (sql.includes('FROM sessions'))
          return {
            id: args[0],
            status: 'active',
            title: 'Mock Session'
          };

        if (sql.includes('FROM invites'))
          return {
            token: args[0],
            session_id: args[1]
          };

        return null;
      },

      all(...args) {
        console.log('[MOCK ALL]', sql, args);
        return [];
      }
    };
  }
};