# Snub-CRON

Cron middleware for [snub](https://github.com/cokeeffekt/snub). Register a
schedule on every instance of your app and each tick is emitted onto the bus
once, to one listener.

Requires Node 20 or newer, `snub` 5.1.0 or newer and Redis.

#### Usage

`npm install snub`
`npm install snub-cron`

#### Basic Example

With redis installed and running with default port and no auth.

```javascript
const Snub = require('snub');
const SnubCron = require('snub-cron');

const snub = new Snub();
const cron = await snub.use(SnubCron());

// register the schedule, you can do this on all instances of snub. only one
// event is emitted per tick for the same namespace.
snub.cron('nameOfCron', '0 * * * *');

// when the cron runs it will emit an event to cron:namespace
snub.on('cron:nameOfCron', (tick) => {
  console.log('Cron ran', tick.scheduledAt);
});
```

The event is sent with `mono`, so with several listeners one of them handles
each tick.

#### Config

```javascript
SnubCron({
  driftMs: 60000,
});
```

| Option | Default | Description |
|---|---|---|
| `driftMs` | `60000` | How far apart the clocks of two instances may be while a tick is still only emitted once. |

#### API

##### `snub.cron(namespace, cronExpression, [cronOptions])`

Schedules `cron:<namespace>`. `cronExpression` takes five fields, or six with
seconds first. `cronOptions` is passed to
[node-cron](https://github.com/node-cron/node-cron), most usefully `timezone`:

```javascript
snub.cron('report', '0 9 * * 1-5', { timezone: 'Australia/Sydney' });
```

Without a `timezone` the schedule runs in the local time of the host. Instances
sharing a namespace should use the same expression and timezone.

Registering a namespace that already exists replaces its schedule. An invalid
expression or timezone throws.

##### `snub.cronDestroy(namespace)`

Stops the schedule for a namespace on this instance.

##### The handle

`snub.use(SnubCron())` resolves to a handle.

| Method | Description |
|---|---|
| `cron(namespace, cronExpression, [cronOptions])` | Same as `snub.cron`. |
| `destroy(namespace)` | Same as `snub.cronDestroy`. |
| `close()` | Stops every schedule on this instance. Call it on shutdown, a running schedule keeps the process alive. |

```javascript
cron.close();
await snub.close();
```

##### The event

| Property | Description |
|---|---|
| `namespace` | The namespace the schedule was registered with. |
| `cronExpression` | The expression that matched. |
| `scheduledAt` | The time the tick was due, in ms since epoch. |

#### How a tick is only emitted once

Every instance reaches a tick at the same scheduled time and tries to claim it
in redis with `SET <prefix>_cron:<namespace>:<scheduledAt> NX`. The first one
emits, the rest do nothing. The claim expires after `driftMs`, so an instance
whose clock is out by less than that still finds it.

Claims are kept under the snub `prefix`, apps with different prefixes can share
a redis and a namespace.

#### Upgrading from 1.x

- Events are emitted when they are due. 1.x emitted them `driftMs` later, a
  minute by default.
- `cronOptions` now reach the scheduler. A `timezone` that 1.x ignored will
  take effect.
- The event carries a payload, 1.x sent none.
- 1.x and 5.x do not dedupe against each other. Upgrade every instance
  together or a tick is emitted once by each version.
- 1.x left a `_snub-cron:schedules` key in redis, it can be deleted.
- Node 20 or newer is required.

#### Tests

Covered by the `cron` group in `snub-smoke`, against a real redis.

`npm test`
