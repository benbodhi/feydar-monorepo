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

    /**
     * Fetches changeable contract data: currentAdmin, currentImageUrl, metadata, context, isVerified
     */
    async fetchTokenContractData(tokenAddress) {
        try {
            const tokenContract = this.getTokenContract(tokenAddress);
            const [currentAdmin, currentImageUrl, metadata, context, isVerified] = await Promise.all([
                tokenContract.admin().catch(() => null),
                tokenContract.imageUrl().catch(() => null),
                tokenContract.metadata().catch(() => null),
                tokenContract.context().catch(() => null),
                tokenContract.isVerified().catch(() => null),
            ]);

            return {
                currentAdmin: currentAdmin ? ethers.getAddress(currentAdmin) : null,
                currentImageUrl: currentImageUrl && currentImageUrl.trim() !== '' ? currentImageUrl : null,
                metadata: metadata && metadata.trim() !== '' ? metadata : null,
                context: context && context.trim() !== '' ? context : null,
                isVerified: isVerified !== null ? Boolean(isVerified) : null,
            };
        } catch (error) {
            logger.warn(`Failed to fetch contract data for ${tokenAddress}: ${error.message}`);
            return {
                currentAdmin: null,
                currentImageUrl: null,
                metadata: null,
                context: null,
                isVerified: null,
            };
        }
    }
}

module.exports = FEYContractHelper;

