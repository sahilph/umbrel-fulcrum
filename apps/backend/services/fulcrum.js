// const ElectrumClient = require("@lily-technologies/electrum-client");
const jayson = require('jayson');
const bitcoindService = require("services/bitcoind");

const constants = require("utils/const.js");

// Fulcrum RPC details: https://github.com/cculianu/Fulcrum?tab=readme-ov-file#admin-script-fulcrumadmin
class ElectrumClient {
  constructor(host, port) {
    this.client = new jayson.Client.tcp({
      host,
      port,
      version: 2,
      delimiter: '\n'
    });
  }

  async request(method, params = []) {
    return new Promise((resolve, reject) => {
      this.client.request(method, params, (error, response) => {
        if (error) return reject(error);
        if (!response?.result) return reject(new Error('Invalid response'));
        resolve(response.result);
      });
    });
  }
}

const electrumClient = new ElectrumClient(constants.ELECTRUM_HOST, constants.ELECTRUM_RPC_PORT);

async function getVersion() {
  // Returns version number from response format: "{name} {semver}"
  // e.g., "Fulcrum 1.11.1" -> "1.11.1"
  const info = await electrumClient.request('getinfo');
  return info?.version?.split(' ')[1] ?? 'unknown';
}

async function syncPercent() {
  try {
    // If Bitcoin node is still syncing, we return -1 and render the "Waiting for Bitcoin Node to finish syncing..." message on the frontend
    // This way, the sync percent is not calculated until the Bitcoin node is done syncing
    const {
      result: bitcoindResponse
    } = await bitcoindService.getBlockChainInfo();
    // TODO: comment out this console log for production
    console.log('bitcoindResponse', bitcoindResponse);
    if (bitcoindResponse.initialblockdownload) {
      return -1;
    }

    const info = await electrumClient.request('getinfo');
    // TODO: comment out this console log for production
    console.log('fulcrum getinfo', info);
    const dbHeight = info['height']; // Fulcrum height
    const daemonHeight = bitcoindResponse.blocks; // Bitcoin node height

    return Math.ceil((dbHeight / daemonHeight) * 100);
  } catch (error) {
    // If there's an error, which is likely due to a failed connection before ElectrumX is ready to accept connections on port 8000, we return -2
    // and render "Connecting to ElectrumX server..." on the frontend
    return -2;
  }
}

module.exports = {
  getVersion,
  syncPercent
};
