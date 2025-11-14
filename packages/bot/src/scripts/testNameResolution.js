#!/usr/bin/env node

/**
 * Test script for basename and ENS resolution
 * Usage: pnpm test:names [address1] [address2] ...
 * 
 * If no addresses provided, uses test addresses with known names
 */

const { ethers } = require('ethers');
const { resolveAddressName, resolveBasename, resolveENS } = require('../services/nameResolver');
const logger = require('../utils/logger');
const { BASENAME_L2_RESOLVER, BASENAME_REVERSE_RESOLVER, BASENAME_REGISTRY } = require('@feydar/shared/constants');
require('dotenv').config();

// Test addresses - you can replace these with addresses you know have basenames/ENS
const TEST_ADDRESSES = [
    // Add known addresses with basenames/ENS here for testing
    // Example: '0x...' (address with basename)
    // Example: '0x...' (address with ENS)
];

async function testNameResolution(addresses) {
    // Enable development mode for detailed logging
    process.env.NODE_ENV = 'development';
    
    logger.section('🧪 Testing Name Resolution');
    
    // Create provider (same as bot/backfill)
    // Try WebSocket first (like bot), fallback to HTTP (like backfill)
    let provider;
    let rpcUrl;
    
    if (process.env.ALCHEMY_API_KEY) {
        // Use WebSocket like the bot
        rpcUrl = `wss://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
        provider = new ethers.WebSocketProvider(rpcUrl, {
            name: 'base',
            chainId: 8453
        });
        logger.detail('Using WebSocket provider (Alchemy)');
    } else if (process.env.RPC_URL || process.env.ALCHEMY_URL) {
        // Use HTTP like the backfill
        rpcUrl = process.env.RPC_URL || process.env.ALCHEMY_URL;
        provider = new ethers.JsonRpcProvider(rpcUrl);
        logger.detail('Using HTTP provider');
    } else {
        logger.error('ALCHEMY_API_KEY or RPC_URL/ALCHEMY_URL environment variable is required');
        process.exit(1);
    }
    
    // Test connection
    try {
        if (provider.ready) {
            await provider.ready;
        }
        const blockNumber = await provider.getBlockNumber();
        logger.detail(`✅ Connected to Base (block: ${blockNumber})`);
    } catch (error) {
        logger.error(`Failed to connect to provider: ${error.message}`);
        process.exit(1);
    }
    
    const testAddresses = addresses.length > 0 ? addresses : TEST_ADDRESSES;
    
    if (testAddresses.length === 0) {
        logger.warn('No test addresses provided. Please provide addresses as arguments:');
        logger.warn('  pnpm test:names 0xAddress1 0xAddress2 ...');
        logger.warn('');
        logger.warn('Or add test addresses to TEST_ADDRESSES in this script.');
        process.exit(1);
    }
    
    logger.detail(`Testing ${testAddresses.length} address(es)...`);
    logger.detail('');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const address of testAddresses) {
        try {
            const checksummed = ethers.getAddress(address);
            logger.section(`Testing: ${checksummed}`);
            
            // Test basename resolution
            logger.detail('---');
            logger.detail('Testing Basename Resolution...');
            logger.detail(`  Address: ${checksummed}`);
            logger.detail(`  L2Resolver: ${BASENAME_L2_RESOLVER || 'not set'}`);
            logger.detail(`  Reverse Resolver (fallback): ${BASENAME_REVERSE_RESOLVER || 'not set'}`);
            logger.detail(`  Registry: ${BASENAME_REGISTRY || 'not set'}`);
            
            // Test forward resolution first to verify the setup works
            logger.detail('  Testing forward resolution...');
            const { convertReverseNodeToBytes } = require('../services/nameResolver');
            try {
                // Try both known basenames
                const testNames = ['benbodhi.base.eth', 'maulsky.base.eth'];
                for (const testName of testNames) {
                    logger.detail(`    Testing forward resolution: ${testName} -> address`);
                
                    // Query L2Resolver directly for forward resolution
                    // Base names use the L2Resolver for both forward and reverse resolution
                    const BASENAME_RESOLVER_FORWARD_ABI = [
                        'function addr(bytes32 node) view returns (address)'
                    ];
                    
                    const nameNode = ethers.namehash(testName);
                    logger.detail(`    Name node (namehash): ${nameNode}`);
                    
                    // Try L2Resolver directly
                    if (BASENAME_L2_RESOLVER) {
                        try {
                            const resolver = new ethers.Contract(BASENAME_L2_RESOLVER, BASENAME_RESOLVER_FORWARD_ABI, provider);
                            const resolvedAddr = await resolver.addr(nameNode);
                            logger.detail(`    Forward resolution result (L2Resolver): ${resolvedAddr}`);
                            if (resolvedAddr && resolvedAddr.toLowerCase() === checksummed.toLowerCase()) {
                                logger.detail(`    ✅ Forward resolution works! This address owns: ${testName}`);
                                
                                // Now test reverse resolution for this known name
                                logger.detail(`    Testing reverse resolution for known name: ${testName}`);
                                const testReverseNode = convertReverseNodeToBytes(resolvedAddr, 8453);
                                logger.detail(`    Reverse node for ${resolvedAddr}: ${testReverseNode}`);
                                try {
                                    const BASENAME_RESOLVER_ABI = ['function name(bytes32 node) view returns (string)'];
                                    const reverseResolver = new ethers.Contract(BASENAME_L2_RESOLVER, BASENAME_RESOLVER_ABI, provider);
                                    const reverseName = await reverseResolver.name(testReverseNode);
                                    logger.detail(`    Reverse resolution result: "${reverseName}" (length: ${reverseName?.length || 0}, type: ${typeof reverseName})`);
                                    if (reverseName && reverseName.length > 0) {
                                        logger.detail(`    ✅ Reverse resolution works! Got: ${reverseName}`);
                                    } else {
                                        logger.detail(`    ⚠️  Reverse resolution returned empty string for known name`);
                                        logger.detail(`    This confirms reverse records are NOT automatically set`);
                                    }
                                } catch (revError) {
                                    logger.detail(`    Reverse resolution error: ${revError.message}`);
                                }
                            } else if (resolvedAddr) {
                                logger.detail(`    ⚠️  Forward resolution works but address mismatch. Expected: ${checksummed}, Got: ${resolvedAddr}`);
                            } else {
                                logger.detail(`    ⚠️  Forward resolution returned zero address`);
                            }
                        } catch (e) {
                            logger.detail(`    Forward resolution error (L2Resolver): ${e.message}`);
                        }
                    }
                }
            } catch (e) {
                logger.detail(`    Forward resolution error: ${e.message}`);
            }
            
            // Calculate and log the reverse nodes for debugging
            try {
                // Method 1: COINTYPE.reverse format
                const reverseNode = convertReverseNodeToBytes(checksummed);
                logger.detail(`  COINTYPE.reverse node: ${reverseNode}`);
                
                // Method 2: Alternative format ({address}.base.eth)
                const addressLower = checksummed.toLowerCase();
                const reverseName = `${addressLower.substring(2)}.base.eth`;
                const altReverseNode = ethers.namehash(reverseName);
                logger.detail(`  Alternative reverse node ({addr}.base.eth): ${altReverseNode}`);
                logger.detail(`  Alternative reverse name: ${reverseName}`);
                
                // Try calling the resolver directly with both methods
                const BASENAME_RESOLVER_ABI = ['function name(bytes32 node) view returns (string)'];
                
                for (const resolverAddress of [BASENAME_L2_RESOLVER, BASENAME_REVERSE_RESOLVER].filter(Boolean)) {
                    logger.detail(`  Testing resolver: ${resolverAddress}`);
                    const resolver = new ethers.Contract(resolverAddress, BASENAME_RESOLVER_ABI, provider);
                    
                    // Try COINTYPE.reverse format
                    try {
                        const nameResult1 = await resolver.name(reverseNode);
                        logger.detail(`    COINTYPE.reverse result: "${nameResult1}" (type: ${typeof nameResult1}, length: ${nameResult1?.length || 'N/A'})`);
                    } catch (directError) {
                        logger.detail(`    COINTYPE.reverse error: ${directError.code || directError.message}`);
                    }
                    
                    // Try alternative format
                    try {
                        const nameResult2 = await resolver.name(altReverseNode);
                        logger.detail(`    Alternative format result: "${nameResult2}" (type: ${typeof nameResult2}, length: ${nameResult2?.length || 'N/A'})`);
                    } catch (directError) {
                        logger.detail(`    Alternative format error: ${directError.code || directError.message}`);
                    }
                }
                
                // Try standard ENS reverse format (addr.reverse)
                logger.detail('  Testing standard ENS reverse format (addr.reverse)...');
                try {
                    const addrReverseNode = ethers.namehash('addr.reverse');
                    const addressBytes = ethers.getBytes(checksummed);
                    const addressHash = ethers.keccak256(addressBytes);
                    const standardReverseNode = ethers.solidityPackedKeccak256(
                        ['bytes32', 'bytes32'],
                        [addrReverseNode, addressHash]
                    );
                    logger.detail(`    Standard ENS reverse node: ${standardReverseNode}`);
                    
                    for (const resolverAddress of [BASENAME_L2_RESOLVER, BASENAME_REVERSE_RESOLVER].filter(Boolean)) {
                        try {
                            const resolver = new ethers.Contract(resolverAddress, BASENAME_RESOLVER_ABI, provider);
                            const nameResult3 = await resolver.name(standardReverseNode);
                            logger.detail(`    Standard ENS reverse result (${resolverAddress}): "${nameResult3}" (type: ${typeof nameResult3}, length: ${nameResult3?.length || 'N/A'})`);
                        } catch (directError) {
                            logger.detail(`    Standard ENS reverse error (${resolverAddress}): ${directError.code || directError.message}`);
                        }
                    }
                } catch (e) {
                    logger.detail(`    Error calculating standard ENS reverse node: ${e.message}`);
                }
                
                // Try provider.lookupAddress
                logger.detail('  Testing provider.lookupAddress...');
                try {
                    const providerName = await provider.lookupAddress(checksummed);
                    logger.detail(`    Provider lookup result: ${providerName || 'null'}`);
                } catch (providerError) {
                    logger.detail(`    Provider lookup error: ${providerError.message}`);
                }
            } catch (e) {
                logger.detail(`  Error calculating reverse nodes: ${e.message}`);
            }
            
            const startBasename = Date.now();
            const basename = await resolveBasename(checksummed, provider);
            const basenameTime = Date.now() - startBasename;
            
            if (basename) {
                logger.detail(`✅ Basename resolved: ${basename} (${basenameTime}ms)`);
                successCount++;
            } else {
                logger.detail(`⚠️  No basename found (${basenameTime}ms)`);
                logger.detail('  This could mean:');
                logger.detail('    - Address has no .base.eth name registered');
                logger.detail('    - Reverse node calculation is incorrect');
                logger.detail('    - Resolver contract address is wrong');
            }
            
            // Test ENS resolution
            logger.detail('---');
            logger.detail('Testing ENS Resolution...');
            const startENS = Date.now();
            const ensName = await resolveENS(checksummed, provider);
            const ensTime = Date.now() - startENS;
            
            if (ensName) {
                logger.detail(`✅ ENS resolved: ${ensName} (${ensTime}ms)`);
                successCount++;
            } else {
                logger.detail(`⚠️  No ENS found (${ensTime}ms)`);
            }
            
            // Test combined resolution (what the bot/backfill uses)
            logger.detail('---');
            logger.detail('Testing Combined Resolution (basename -> ENS -> hex)...');
            const startCombined = Date.now();
            const resolved = await resolveAddressName(checksummed, provider);
            const combinedTime = Date.now() - startCombined;
            
            logger.detail(`Result: ${resolved.name}`);
            if (resolved.name !== checksummed) {
                logger.detail(`✅ Name resolved: ${resolved.name} (${combinedTime}ms)`);
                successCount++;
            } else {
                logger.detail(`⚠️  No name found, using address (${combinedTime}ms)`);
            }
            
            logger.detail('');
            
        } catch (error) {
            logger.error(`Error testing ${address}: ${error.message}`);
            failCount++;
            logger.detail('');
        }
    }
    
    // Summary
    logger.section('📊 Test Summary');
    logger.detail(`Total addresses tested: ${testAddresses.length}`);
    logger.detail(`Successful resolutions: ${successCount}`);
    logger.detail(`Failed/No name: ${failCount}`);
    logger.detail('');
    
    if (successCount > 0) {
        logger.detail('✅ Name resolution is working!');
    } else {
        logger.warn('⚠️  No names were resolved. This could mean:');
        logger.warn('   - The test addresses don\'t have basenames/ENS');
        logger.warn('   - There\'s an issue with the resolution logic');
        logger.warn('   - Network/provider issues');
    }
    
    // Cleanup
    try {
        if (provider.destroy) {
            await provider.destroy();
        }
    } catch (e) {
        // Ignore cleanup errors
    }
    
    process.exit(0);
}

// Run the test
const addresses = process.argv.slice(2);
testNameResolution(addresses).catch((error) => {
    logger.error('Test failed:', error);
    process.exit(1);
});

