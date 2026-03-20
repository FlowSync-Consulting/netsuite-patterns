module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/patterns', '<rootDir>/shared'],
  moduleNameMapper: {
    '^N/search$': '<rootDir>/shared/mocks/search.js',
    '^N/record$': '<rootDir>/shared/mocks/record.js',
    '^N/runtime$': '<rootDir>/shared/mocks/runtime.js',
    '^N/log$': '<rootDir>/shared/mocks/log.js',
    '^N/query$': '<rootDir>/shared/mocks/query.js',
    '^N/ui/serverWidget$': '<rootDir>/shared/mocks/serverWidget.js',
    '^N/format$': '<rootDir>/shared/mocks/format.js',
    '^N/url$': '<rootDir>/shared/mocks/url.js',
    '^N/email$': '<rootDir>/shared/mocks/email.js',
    '^N/render$': '<rootDir>/shared/mocks/render.js',
    '^N/file$': '<rootDir>/shared/mocks/file.js',
    '^N/task$': '<rootDir>/shared/mocks/task.js',
    '^N/redirect$': '<rootDir>/shared/mocks/redirect.js',
    '^N/error$': '<rootDir>/shared/mocks/error.js',
    '^N/config$': '<rootDir>/shared/mocks/config.js',
    '^N/http$': '<rootDir>/shared/mocks/http.js',
    '^N/https$': '<rootDir>/shared/mocks/https.js'
  }
};
