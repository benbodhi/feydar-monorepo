const { ethers } = require('ethers');
const logger = require('../../utils/logger');

class FEYContractHelper {
    constructor(provider, factoryAddress) {
        this.provider = provider;
        this.factoryAddress = factoryAddress;
        
        this.feyFactory = new ethers.Contract(
            factoryAddress,
            require('../abis/FEYFactory.json'),
            provider
        );
        logger.detail('Initialized FEY Factory', factoryAddress);
    }

    getTokenContract(address) {
        return new ethers.Contract(
            address,
            require('../abis/Token.json'),
            this.provider
        );
    }
}

module.exports = FEYContractHelper;

