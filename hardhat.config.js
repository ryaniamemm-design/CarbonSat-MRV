                                                       

                                                                    
                                       
                                               
                                                                                      
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const SEPOLIA_PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY || "";

const networks = { hardhat: { hardfork: "cancun" } };
if (SEPOLIA_RPC_URL && SEPOLIA_PRIVATE_KEY) {
  networks.sepolia = {
    url: SEPOLIA_RPC_URL,
    accounts: [SEPOLIA_PRIVATE_KEY],
    chainId: 11155111,
  };
}

module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks,
};
