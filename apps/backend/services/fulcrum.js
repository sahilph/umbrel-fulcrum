const ElectrumClient = require("@lily-technologies/electrum-client");
const bitcoindService = require("services/bitcoind");

const FULCRUM_HOST = process.env.FULCRUM_HOST || "0.0.0.0";
const FULCRUM_PORT = parseInt(process.env.FULCRUM_PORT) || 50001;
const rpcClient = new ElectrumClient(FULCRUM_PORT, FULCRUM_HOST, "tcp");

async function getVersion() {
  // initElectrum() also requests the server version
  // If tried to connect via the initElectrum(), the first time works,
  // But henceforth Fulcrum will give error as it does not like 
  // server version to be requested again in the same connection
  // Hence connect() will be used instead.
  await rpcClient.connect()

  const versionInfo= await rpcClient.server_version("umbrel","1.4")
  // versionInfo[0] comes in as fulcrum/0.9.4, so we parse
  const version = versionInfo[0].substring(
    versionInfo[0].indexOf("/") + 1
  );
  
  // Close the connection, otherwise the next request for verion will give error 
  await rpcClient.close()
  
  return version;
}

// This is a little hacky way of determining if fulcrum is sync'd to bitcoind
// see https://github.com/romanz/electrs/pull/543#issuecomment-973078262
async function syncPercent() {
  // first, check if bitcoind isn't still IBD
  const {
    result: bitcoindResponse
  } = await bitcoindService.getBlockChainInfo();
  if (bitcoindResponse.initialblockdownload) {
    return 0;
  }

  // Similar to getversion() above.
  await rpcClient.connect()

  const {
    height: fulcrumHeight
  } = await rpcClient.blockchainHeaders_subscribe();
  
  await rpcClient.close()
  
  return (fulcrumHeight / bitcoindResponse.blocks) * 100;
}

module.exports = {
  getVersion,
  syncPercent
};
