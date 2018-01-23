'use strict';

import {l} from './helpers/debug';
import expectThrow from './helpers/expectThrow';

const SmartzToken = artifacts.require('SmartzToken.sol');
const SmartzTokenLifecycleManager = artifacts.require('SmartzTokenLifecycleManager.sol');
const SmartzTokenEmissionPools = artifacts.require('SmartzTokenEmissionPools.sol');


// converts amount of SMR token into token-wei (smallest token units)
function SMR(amount) {
    return web3.toWei(amount, 'ether');
}

// converts amount of SMRE token into token-wei (smallest token units)
function SMRE(amount) {
    return amount * 100;
}


contract('SmartzTokenLifecycleManagerTest', function(accounts) {
    const role = {
        nobody: accounts[0],
        owner1: accounts[1],
        sale: accounts[2],
        early_investor: accounts[3],
        dev_fund: accounts[4],
        investor: accounts[5]
    };

    it('test full lifecycle', async function() {
        const SMRToken = await SmartzToken.new([role.owner1], 1, {from: role.nobody});

        const LCManager = await SmartzTokenLifecycleManager.new([role.owner1], 1, SMRToken.address, {from: role.nobody});
        await SMRToken.setController(LCManager.address, {from: role.owner1});

        const SMREToken = await SmartzTokenEmissionPools.new([role.owner1], 1, LCManager.address, {from: role.nobody});
        await LCManager.setPools(SMREToken.address, {from: role.owner1});

        await LCManager.setSale(role.sale, {from: role.owner1});


        await SMREToken.mint(role.early_investor, SMRE(10), {from: role.owner1});

        await LCManager.mint(role.investor, SMR(1200), {from: role.sale});
        assert((await SMRToken.balanceOf(role.investor)).eq(SMR(1200)));
        assert((await SMRToken.totalSupply()).eq(SMR(1200)));

        await SMREToken.mint(role.dev_fund, SMRE(40), {from: role.owner1});

        // end of public sales
        await LCManager.detach({from: role.sale});
        await LCManager.setSalesFinished({from: role.owner1});

        await SMREToken.claimSMRforAll(100, {from: role.nobody});
        assert((await SMRToken.balanceOf(role.early_investor)).eq(SMR(240)));
        assert((await SMRToken.balanceOf(role.dev_fund)).eq(SMR(960)));
        assert((await SMRToken.totalSupply()).eq(SMR(2400)));
    });
});
