// Loaded before every test. Tests may replace fetch with synthetic fixtures only.
const deny = () => { throw Error('Offline test: real network access is forbidden'); };
global.fetch = deny;
require('node:net').Socket.prototype.connect = deny;
require('node:tls').connect = deny;
for (const name of ['node:http', 'node:https']) {
  require(name).request = deny;
  require(name).get = deny;
}
