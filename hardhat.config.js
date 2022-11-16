require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;

module.exports = {
  solidity: "0.8.4",
  networks: {
    mainnet: {
      url: "https://eth-mainnet.alchemyapi.io/v2/LS8_p1BlfcUbmNMPsYzh6hRIYHtK92D7",
      accounts: [PRIVATE_KEY]
    }
  }
};
