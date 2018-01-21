'use strict';

const _owners = [
    '0xaacf78f8e1fbdcf7d941e80ff8b817be1f054af4',
    '0xcb0ac3ce1e27c0b26dcf4ccd4a6891ed93b487fe',
    '0x83d262fbf830065acd397c2f8548ce859da6e7d1'
];


const SmartzToken = artifacts.require('SmartzToken.sol');


module.exports = function(deployer, network) {
    deployer.deploy(SmartzToken, _owners, 2);
};
