
const cron = require('node-cron');

module.exports = function (config) {
  config = Object.assign({
    driftMs: 1000 * 60,
  }, config || {});

  var tracked = {};
  return function (snub) {
    snub.cron = function (namespace, cronExpression, cronOptions) {
      cronOptions = Object.assign({}, cronOptions, { scheduled: true });

      tracked[namespace] = {
        namespace,
        cronExpression,
        cron: cron.schedule(cron, _ => {
          snub.redis.sadd('_snub-cron:schedules', namespace);
          setTimeout(async _ => {
            if (!await snub.redis.srem('_snub-cron:schedules', namespace)) return;
            snub.mono('cron:' + namespace);
          }, config.driftMs);
        })
      };
    };

    snub.cronDestroy = function (namespace) {
      if (!tracked[namespace]) return;
      tracked[namespace].cron.destroy();
      delete tracked[namespace];
    };
  };
};
