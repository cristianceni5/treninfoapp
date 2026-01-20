const { withEntitlementsPlist, withInfoPlist } = require('@expo/config-plugins');

/**
 * Usa solo notifiche locali: rimuove entitlements/capabilities di Push e
 * toglie `remote-notification` dai background modes.
 *
 * Necessario per buildare con Personal Team (free) su iOS.
 */
module.exports = function withLocalOnlyNotifications(config) {
  config = withEntitlementsPlist(config, (c) => {
    if (c.modResults && typeof c.modResults === 'object') {
      delete c.modResults['aps-environment'];
    }
    return c;
  });

  config = withInfoPlist(config, (c) => {
    const modes = c.modResults?.UIBackgroundModes;
    if (Array.isArray(modes)) {
      c.modResults.UIBackgroundModes = modes.filter((m) => m !== 'remote-notification');
    }
    return c;
  });

  return config;
};

