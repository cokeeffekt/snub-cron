
const cron = require('node-cron');

module.exports = function (config) {
  config = Object.assign({
    driftMs: 1000 * 60,
  }, config || {});

  var tracked = [];
  return function (snub) {
    snub.cron = function (namespace, cronExpression, cronOptions) {
      cronOptions = Object.assign({}, cronOptions, { scheduled: true });
      tracked.push({
        namespace,
        cronExpression,
        cron: cron.schedule(cron, _ => {
          snub.redis.sadd('_snub-cron:schedules', namespace);
          setTimeout(async _ => {
            var nameSpaces = await snub.redis.pipeline([['smembers', '_snub-cron:schedules'], ['del', '_snub-cron:schedules']]);
            if (nameSpaces[0].length)
              for (const n of nameSpaces[0])
                snub.mono('cron:' + n);
          }, config.driftMs);
        })
      });
    };

    snub.cronDestroy = function (namespace) {
      var cronIdx = tracked.findIndex(c => c.namespace === namespace);
      tracked[cronIdx].cron.destroy();
      tracked.splice(cronIdx, 1);
    };
  };
};
