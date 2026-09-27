const cron = require('node-cron');

module.exports = function (config) {
  config = Object.assign(
    {
      // how far apart the clocks of two instances may be while a tick is still
      // only emitted once. It is the lifetime of the claim, not a delay.
      driftMs: 1000 * 60,
    },
    config || {}
  );

  return function (snub) {
    var tracked = {};
    var closed = false;

    var prefix = snub.prefix;
    if (typeof prefix !== 'string') {
      // snub < 5.1.0 has no prefix getter
      prefix = 'snub:';
      console.warn(
        '[snub-cron] snub.prefix is unavailable (snub < 5.1.0), assuming "snub:"'
      );
    }

    // Every instance sees the same scheduled time for a tick, so the first one
    // to claim it emits and the rest bail. The claim expires on its own.
    async function tick(job, date) {
      if (closed || tracked[job.namespace] !== job) return;
      if (snub.redis.status === 'end') return;

      var scheduledAt = Math.floor(date.getTime() / 1000) * 1000;
      try {
        var claimed = await snub.redis.set(
          prefix + '_cron:' + job.namespace + ':' + scheduledAt,
          '1',
          'PX',
          Math.max(1, config.driftMs),
          'NX'
        );
        if (!claimed) return;
        if (closed || tracked[job.namespace] !== job) return;
        await snub
          .mono('cron:' + job.namespace, {
            namespace: job.namespace,
            cronExpression: job.cronExpression,
            scheduledAt,
          })
          .send();
      } catch (error) {
        console.error(
          `[snub-cron] Failed to run "${job.namespace}":`,
          error.message
        );
      }
    }

    function destroy(namespace) {
      var job = tracked[namespace];
      if (!job) return;
      delete tracked[namespace];
      try {
        var destroyed = job.cron.destroy();
        if (destroyed && destroyed.catch) destroyed.catch((_) => {});
      } catch (_) {}
    }

    snub.cron = function (namespace, cronExpression, cronOptions) {
      if (closed) throw new Error('[snub-cron] middleware is closed');
      if (!cron.validate(cronExpression))
        throw new Error(
          `[snub-cron] Invalid cron expression "${cronExpression}" for "${namespace}"`
        );

      cronOptions = Object.assign({}, cronOptions);
      // node-cron 4 always starts a scheduled task
      delete cronOptions.scheduled;

      // registering a namespace again replaces its schedule
      destroy(namespace);

      var job = { namespace, cronExpression };
      job.cron = cron.schedule(
        cronExpression,
        (context) => tick(job, context.date),
        cronOptions
      );
      tracked[namespace] = job;
    };

    snub.cronDestroy = destroy;

    var handle = {
      cron: snub.cron,
      destroy,
      close() {
        closed = true;
        Object.keys(tracked).forEach(destroy);
      },
    };
    return handle;
  };
};
