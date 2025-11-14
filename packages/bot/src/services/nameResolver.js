const { ethers } = require('ethers');
const logger = require('../utils/logger');

const { BASENAME_L2_RESOLVER, BASENAME_REVERSE_RESOLVER, BASENAME_REGISTRY, BASENAME_REVERSE_REGISTRAR, BASE_CHAIN_ID } = require('@feydar/shared/constants');

// Base Name Service Reverse Resolver ABI
const BASENAME_RESOLVER_ABI = [
    'function name(bytes32 node) view returns (string)'
];

// Base Name Service Registry ABI
const BASENAME_REGISTRY_ABI = [
    'function owner(bytes32 node) view returns (address)',
    'function resolver(bytes32 node) view returns (address)',
    'event NameRegistered(bytes32 indexed node, address indexed owner)',
    'event NameTransferred(bytes32 indexed node, address indexed newOwner)'
];

// Base Name Service Resolver ABI (for forward resolution)
const BASENAME_RESOLVER_FORWARD_ABI = [
    'function addr(bytes32 node) view returns (address)',
    'function name(bytes32 node) view returns (string)'
];

/**
 * Converts chain ID to coin type for reverse resolution
 * @param {number} chainId - The chain ID (e.g., 8453 for Base)
 * @returns {string} - The coin type as hex string
 */
function convertChainIdToCoinType(chainId) {
    if (chainId === 1) {
        return 'addr';
    }
    const cointype = (0x80000000 | chainId) >>> 0;
    return cointype.toString(16).toUpperCase();
}

/**
 * Converts an address to Base-specific reverse node bytes
 * @param {string} address - The address to convert
 * @param {number} chainId - The chain ID (default: 8453 for Base)
 * @returns {string} - The reverse node as bytes32
 */
function convertReverseNodeToBytes(address, chainId = BASE_CHAIN_ID) {
    const addressFormatted = ethers.getAddress(address).toLowerCase();
    const chainCoinType = convertChainIdToCoinType(chainId);
    const reverseName = `${addressFormatted.substring(2)}.${chainCoinType}.reverse`;
    const reverseNode = ethers.namehash(reverseName);
    
    return reverseNode;
}

/**
 * Resolves Base Name Service (basename) for an address
 * @param {string} address - The address to resolve
 * @param {ethers.Provider} provider - Ethers provider instance
 * @returns {Promise<string|null>} - The basename or null if not found
 */
async function resolveBasename(address, provider) {
    try {
        const checksummedAddress = ethers.getAddress(address);
        
        try {
            const name = await provider.lookupAddress(checksummedAddress);
            if (name && name.length > 0) {
                // Check if it's a .base.eth or .eth name
                if (name.endsWith('.base.eth') || name.endsWith('.eth')) {
                    // Verify forward resolution
                    try {
                        const resolvedAddress = await provider.resolveName(name);
                        if (resolvedAddress && resolvedAddress.toLowerCase() === checksummedAddress.toLowerCase()) {
                            const cleanName = name.replace(/\.(base\.)?eth$/i, '');
                            if (cleanName && cleanName.length > 0) {
                                // Only log in development mode to avoid duplicate logs in backfiller
                                if (process.env.NODE_ENV === 'development' && process.env.VERBOSE_NAME_RESOLUTION === 'true') {
                                    logger.detail('Resolved basename via provider', `${checksummedAddress} -> ${cleanName}`);
                                }
                                return cleanName;
                            }
                        }
                    } catch (verifyError) {
                        // Still return the name if verification fails (might be valid)
                        const cleanName = name.replace(/\.(base\.)?eth$/i, '');
                        if (cleanName && cleanName.length > 0 && !cleanName.includes('0x')) {
                            return cleanName;
                        }
                    }
                }
            }
        } catch (e) {
            // Provider lookup failed, continue to other methods
        }
        
        try {
            const addressLower = checksummedAddress.toLowerCase();
            const reverseName = `${addressLower.substring(2)}.base.eth`;
            const reverseNode = ethers.namehash(reverseName);
            
            // Try both resolver contracts
            for (const resolverAddress of [BASENAME_L2_RESOLVER, BASENAME_REVERSE_RESOLVER].filter(Boolean)) {
                try {
                    const resolver = new ethers.Contract(resolverAddress, BASENAME_RESOLVER_ABI, provider);
                    const name = await resolver.name(reverseNode);
                    
                    if (name && name.length > 0 && name !== '' && name !== '0x' && name !== ethers.ZeroHash) {
                        const isAddress = /^0x[a-fA-F0-9]{40}$/.test(name);
                        if (!isAddress) {
                            const cleanName = name.replace(/\.base\.eth$/i, '');
                            if (cleanName && cleanName.length > 0 && !cleanName.includes('0x')) {
                                // Only log in development mode to avoid duplicate logs in backfiller
                                if (process.env.NODE_ENV === 'development' && process.env.VERBOSE_NAME_RESOLUTION === 'true') {
                                    logger.detail('Resolved basename via alternative format', `${checksummedAddress} -> ${cleanName}`);
                                }
                                return cleanName;
                            }
                        }
                    }
                } catch (callError) {
                    // Continue to next resolver or method
                }
            }
        } catch (e) {
            // Alternative format failed, continue
        }
        
        try {
            const addrReverseNode = ethers.namehash('addr.reverse');
            const addressBytes = ethers.getBytes(checksummedAddress);
            const addressHash = ethers.keccak256(addressBytes);
            const standardReverseNode = ethers.solidityPackedKeccak256(
                ['bytes32', 'bytes32'],
                [addrReverseNode, addressHash]
            );
            
            for (const resolverAddress of [BASENAME_L2_RESOLVER, BASENAME_REVERSE_RESOLVER].filter(Boolean)) {
                try {
                    const resolver = new ethers.Contract(resolverAddress, BASENAME_RESOLVER_ABI, provider);
                    const name = await resolver.name(standardReverseNode);
                    
                    if (name && name.length > 0 && name !== '' && name !== '0x' && name !== ethers.ZeroHash) {
                        const isAddress = /^0x[a-fA-F0-9]{40}$/.test(name);
                        if (!isAddress && name.endsWith('.base.eth')) {
                            const cleanName = name.replace(/\.base\.eth$/i, '');
                            if (cleanName && cleanName.length > 0 && !cleanName.includes('0x')) {
                                // Only log in development mode to avoid duplicate logs in backfiller
                                if (process.env.NODE_ENV === 'development' && process.env.VERBOSE_NAME_RESOLUTION === 'true') {
                                    logger.detail('Resolved basename via standard ENS reverse', `${checksummedAddress} -> ${cleanName}`);
                                }
                                return cleanName;
                            }
                        }
                    }
                } catch (callError) {
                    // Continue to next resolver or method
                }
            }
        } catch (e) {
            // Standard reverse format failed, continue
        }
        
        try {
            const reverseNode = convertReverseNodeToBytes(checksummedAddress, BASE_CHAIN_ID);
            
            let resolverAddress = BASENAME_L2_RESOLVER;
            if (BASENAME_REGISTRY) {
                try {
                    const registry = new ethers.Contract(BASENAME_REGISTRY, BASENAME_REGISTRY_ABI, provider);
                    const registryResolver = await registry.resolver(reverseNode);
                    if (registryResolver && registryResolver !== ethers.ZeroAddress) {
                        resolverAddress = registryResolver;
                        if (process.env.NODE_ENV === 'development') {
                            logger.detail('Found resolver in registry for reverse node', resolverAddress);
                        }
                    }
                } catch (e) {
                    // Registry query failed, use default resolver
                }
            }
            
            if (resolverAddress) {
                try {
                    const resolver = new ethers.Contract(resolverAddress, BASENAME_RESOLVER_ABI, provider);
                    const name = await resolver.name(reverseNode);
                    
                    const isAddress = name && /^0x[a-fA-F0-9]{40}$/.test(name);
                    
                    if (name && name.length > 0 && name !== '' && name !== '0x' && name !== ethers.ZeroHash && !isAddress) {
                        try {
                            const nameNode = ethers.namehash(name);
                            const forwardResolver = new ethers.Contract(BASENAME_L2_RESOLVER, BASENAME_RESOLVER_FORWARD_ABI, provider);
                            const resolvedAddress = await forwardResolver.addr(nameNode);
                            if (resolvedAddress && resolvedAddress.toLowerCase() === checksummedAddress.toLowerCase()) {
                                const cleanName = name.replace(/\.base\.eth$/i, '');
                                if (cleanName && cleanName.length > 0) {
                                    // Only log in development mode to avoid duplicate logs in backfiller
                                    if (process.env.NODE_ENV === 'development' && process.env.VERBOSE_NAME_RESOLUTION === 'true') {
                                        logger.detail('Resolved basename via COINTYPE.reverse', `${checksummedAddress} -> ${cleanName}`);
                                    }
                                    return cleanName;
                                }
                            }
                        } catch (verifyError) {
                            const cleanName = name.replace(/\.base\.eth$/i, '');
                            if (cleanName && cleanName.length > 0 && !cleanName.includes('0x')) {
                                // Only log in development mode to avoid duplicate logs in backfiller
                                if (process.env.NODE_ENV === 'development' && process.env.VERBOSE_NAME_RESOLUTION === 'true') {
                                    logger.detail('Resolved basename (unverified)', `${checksummedAddress} -> ${cleanName}`);
                                }
                                return cleanName;
                            }
                        }
                    }
                } catch (callError) {
                    const errorCode = callError.code || callError.reason || '';
                    const errorMessage = callError.message || '';
                    
                    const isExpectedError = errorCode === 'CALL_EXCEPTION' || 
                                          errorCode === 'BAD_DATA' ||
                                          errorMessage.includes('invalid length for result data') ||
                                          errorMessage.includes('BAD_DATA');
                    
                    if (!isExpectedError && process.env.NODE_ENV === 'development') {
                        logger.detail('L2Resolver call error', callError.message);
                    }
                }
            }
            
            if (BASENAME_REVERSE_RESOLVER && resolverAddress !== BASENAME_REVERSE_RESOLVER) {
                try {
                    const resolver = new ethers.Contract(BASENAME_REVERSE_RESOLVER, BASENAME_RESOLVER_ABI, provider);
                    const name = await resolver.name(reverseNode);
                    
                    const isAddress = name && /^0x[a-fA-F0-9]{40}$/.test(name);
                    
                    if (name && name.length > 0 && name !== '' && name !== '0x' && name !== ethers.ZeroHash && !isAddress) {
                        const cleanName = name.replace(/\.base\.eth$/i, '');
                        if (cleanName && cleanName.length > 0 && !cleanName.includes('0x')) {
                            // Only log in development mode to avoid duplicate logs in backfiller
                            if (process.env.NODE_ENV === 'development' && process.env.VERBOSE_NAME_RESOLUTION === 'true') {
                                logger.detail('Resolved basename via fallback resolver', `${checksummedAddress} -> ${cleanName}`);
                            }
                            return cleanName;
                        }
                    }
                } catch (callError) {
                    // Fallback resolver also failed
                }
            }
        } catch (e) {
            if (process.env.NODE_ENV === 'development') {
                logger.detail('Basename contract lookup failed', e.message);
            }
        }
        
        return null;
    } catch (error) {
        if (process.env.NODE_ENV === 'development') {
            logger.detail('Basename resolution error', error.message);
        }
        return null;
    }
}

/**
 * Resolves ENS name for an address
 * ENS resolution always starts from Ethereum Mainnet (L1)
 * @param {string} address - The address to resolve
 * @param {ethers.Provider} provider - Ethers provider instance (Base provider, we'll create mainnet)
 * @returns {Promise<string|null>} - The ENS name or null if not found
 */
async function resolveENS(address, provider) {
    try {
        const checksummedAddress = ethers.getAddress(address);
        
        let mainnetProvider;
        try {
            if (process.env.ALCHEMY_API_KEY) {
                const alchemyProvider = new ethers.JsonRpcProvider(
                    `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
                );
                await alchemyProvider.getBlockNumber();
                mainnetProvider = alchemyProvider;
            } else {
                mainnetProvider = new ethers.JsonRpcProvider('https://eth.llamarpc.com');
            }
        } catch (e) {
            if (process.env.NODE_ENV === 'development') {
                logger.detail('Failed to create mainnet provider for ENS', e.message);
            }
            return null;
        }
        
        try {
            const ensName = await mainnetProvider.lookupAddress(checksummedAddress);
            
            if (ensName && ensName.endsWith('.eth') && !ensName.endsWith('.base.eth')) {
                try {
                    const resolvedAddress = await mainnetProvider.resolveName(ensName);
                    if (resolvedAddress && resolvedAddress.toLowerCase() === checksummedAddress.toLowerCase()) {
                        return ensName;
                    } else if (process.env.NODE_ENV === 'development') {
                        logger.detail(`ENS forward resolution mismatch: ${ensName} -> ${resolvedAddress} (expected ${checksummedAddress})`);
                    }
                } catch (verifyError) {
                    if (process.env.NODE_ENV === 'development') {
                        logger.detail(`ENS forward resolution failed: ${verifyError.message}`);
                    }
                }
            }
        } catch (lookupError) {
            if (process.env.NODE_ENV === 'development') {
                logger.detail(`ENS lookupAddress failed: ${lookupError.message}`);
            }
        }
        
        return null;
    } catch (error) {
        if (process.env.NODE_ENV === 'development') {
            logger.detail('ENS resolution error', error.message);
        }
        return null;
    }
}

/**
 * Resolves address to names (basename and ENS separately)
 * @param {string} address - The address to resolve
 * @param {ethers.Provider} provider - Ethers provider instance
 * @returns {Promise<{basename: string|null, ens: string|null, name: string, address: string}>} - Object with resolved names
 */
async function resolveAddressName(address, provider) {
    try {
        const checksummedAddress = ethers.getAddress(address);
        
        const basenamePromise = resolveBasename(checksummedAddress, provider);
        const basenameTimeout = new Promise((resolve) => setTimeout(() => resolve(null), 2000));
        const basename = await Promise.race([basenamePromise, basenameTimeout]);
        
        const ensPromise = resolveENS(checksummedAddress, provider);
        const ensTimeout = new Promise((resolve) => setTimeout(() => resolve(null), 2000));
        const ens = await Promise.race([ensPromise, ensTimeout]);
        
        const name = basename || ens || checksummedAddress;
        
        return {
            basename: basename || null,
            ens: ens || null,
            name: name,
            address: checksummedAddress
        };
    } catch (error) {
        logger.warn('Name resolution error', error.message);
        try {
            const checksummedAddress = ethers.getAddress(address);
            return {
                basename: null,
                ens: null,
                name: checksummedAddress,
                address: checksummedAddress
            };
        } catch (e) {
            return {
                basename: null,
                ens: null,
                name: address,
                address: address
            };
        }
    }
}

module.exports = {
    resolveAddressName,
    resolveBasename,
    resolveENS,
    convertReverseNodeToBytes
};


