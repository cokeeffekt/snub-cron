# Snub-CRON

Middleware cron service for snub.

#### Usage

`npm install snub`
`npm install snub-cron`

#### Basic Example

With redis installed and running with default port and no auth.

```javascript
const Snub = require('snub');
const SnubCron = require('snub-cron');

const snub = new Snub();
const SnubCron = new SnubCron();

snub.use(SnubCron);

// register the cron schedule, you can do this on all instances of snub. no dupe will be emitted for same namespace.
snub.cron('nameOfCron', '0 * * * *');


// when the cron runs it will emit an even to cron:namespace

snub.on('cron:nameOfCron', _ => {
  console.log('Cron ran');
});

```
