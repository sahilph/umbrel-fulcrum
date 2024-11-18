// const ElectrumClient = require("@lily-technologies/electrum-client");
const jayson = require('jayson');
const bitcoindService = require("services/bitcoind");
const fs = require('fs');

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
  try {
    // We first try querying the admin port
    const info = await electrumClient.request('getinfo');
    const version = info?.version?.split(' ')[1];
    if (version) return version;

    throw new Error('Invalid version from RPC');
  } catch (error) {
    // If RPC didn't return a valid version, fall back to log parsing
    // Fulcrum Admin port doesn't start listening until the node is synced so for now we only use this if the RPC call fails
    // We can remove this fallback if this GH Issue is resolved: https://github.com/cculianu/Fulcrum/issues/263
    try {
      const logs = fs.readFileSync('/fulcrum-logs/fulcrum.log', 'utf8');
      const lines = logs.split('\n');
      
      const versionLine = lines.find(line => 
        line.includes('Fulcrum') && line.includes('(Release')
      ) || '';

      const match = versionLine.match(/Fulcrum ([\d.]+)/);
      return match ? match[1] : 'unknown';
    } catch (logError) {
      console.error('Error reading Fulcrum version:', logError);
      return 'unknown';
    }
  }
}

async function syncPercent() {
  try {
    const bitcoindStatus = await getBitcoindStatus();
    if (bitcoindStatus.initialblockdownload) return -1;

    const syncStatus = await getFulcrumSyncStatus(bitcoindStatus.blocks);
    return syncStatus;
  } catch (error) {
    console.error('Error getting Fulcrum sync percentage:', error);
    // For -2 we render "Connecting to ElectrumX server..." on the frontend
    return -2;
  }
}

// Helper Functions:

async function getBitcoindStatus() {
  const { result: bitcoindResponse } = await bitcoindService.getBlockChainInfo();
  return bitcoindResponse;
}

async function getFulcrumSyncStatus(daemonHeight) {
  try {
    // We first try querying the admin port
    return await getRPCSyncStatus(daemonHeight);
  } catch (error) {
    // If the admin port is not ready, we fall back to parsing the logs
    return getLogSyncStatus();
  }
}

// Get sync status via RPC
async function getRPCSyncStatus(daemonHeight) {
  const info = await electrumClient.request('getinfo');
  console.log('fulcrum height', info.height);
  const dbHeight = info['height'];
  return Math.ceil((dbHeight / daemonHeight) * 100);
}

// Get sync status via log parsing
async function getLogSyncStatus() {
  const logs = fs.readFileSync('/fulcrum-logs/fulcrum.log', 'utf8');
  
  const lines = logs.split('\n').reverse();
  const latestLine = lines.find(line => 
    /<Controller> Processed height: (\d+), ([\d.]+)%/.test(line)
  ) || '';

  console.log('latest sync status from logs', latestLine);
  // example
  // [2024-11-16 05:21:59.953] <Controller> Processed height: 1000, 10.0%, 4119.3 blocks/

  const percentageMatch = latestLine.match(/(\d+), ([\d.]+)%/);
  if (!percentageMatch) throw new Error('No sync percentage found in logs');
  
  const percentage = percentageMatch[2];
  console.log('sync percentage from logs', percentage);
  return parseFloat(percentage);
}

module.exports = {
  getVersion,
  syncPercent
};

