'use strict';

import {l} from './helpers/debug';
import expectThrow from './helpers/expectThrow';
import {assertBigNumberEqual} from './helpers/asserts';
import {SMR, SMRE} from './helpers/smartz';

const SmartzTokenEmissionPools = artifacts.require('SmartzTokenEmissionPools.sol');


contract('SmartzTokenEmissionPoolsTest', function(accounts) {
    const role = {
        nobody: accounts[0],
        owner1: accounts[1],
        early_investor1: accounts[2],
        early_investor2: accounts[3],
        dev_fund: accounts[4]
    };

    async function instantiate() {
        return await SmartzTokenEmissionPools.new([role.owner1], 1, '0x1111111111111111111111111111111111111111', {from: role.nobody});
    }


    it('test minting', async function() {
        const SMREToken = await instantiate();

        async function checkNoIllegalMinting() {
            await expectThrow(SMREToken.mint(role.early_investor1, SMRE(0), {from: role.owner1}));
            await expectThrow(SMREToken.mint(role.early_investor1, SMRE(100), {from: role.owner1}));
            for (const _from of [role.early_investor1, role.early_investor2, role.nobody]) {
                await expectThrow(SMREToken.mint(role.early_investor1, SMRE(2), {from: _from}));
                await expectThrow(SMREToken.mint(_from, SMRE(2), {from: _from}));
            }
        }


        await checkNoIllegalMinting();

        await SMREToken.mint(role.early_investor1, SMRE(7), {from: role.owner1});
        assertBigNumberEqual(await SMREToken.balanceOf(role.early_investor1), SMRE(7));
        assertBigNumberEqual(await SMREToken.totalSupply(), SMRE(7));

        assertBigNumberEqual(await SMREToken.publiclyDistributedParts(), SMRE(93));


        await checkNoIllegalMinting();

        await SMREToken.mint(role.early_investor2, SMRE(3), {from: role.owner1});
        assertBigNumberEqual(await SMREToken.balanceOf(role.early_investor2), SMRE(3));
        assertBigNumberEqual(await SMREToken.totalSupply(), SMRE(10));

        assertBigNumberEqual(await SMREToken.publiclyDistributedParts(), SMRE(90));


        await checkNoIllegalMinting();

        await SMREToken.mint(role.dev_fund, SMRE(40), {from: role.owner1});
        assertBigNumberEqual(await SMREToken.balanceOf(role.dev_fund), SMRE(40));
        assertBigNumberEqual(await SMREToken.totalSupply(), SMRE(50));

        assertBigNumberEqual(await SMREToken.publiclyDistributedParts(), SMRE(50));

        await checkNoIllegalMinting();
    });

    it('test partial ERC20', async function() {
        const SMREToken = await instantiate();

        async function checkNoTransfers() {
            for (const fn_name of ['transfer', 'approve'])
                for (const _to of [role.early_investor1, role.early_investor2, role.nobody])
                    for (const _from of [role.early_investor1, role.early_investor2, role.nobody])
                        for (const amount of [SMRE(2), SMRE(10)])
                            await expectThrow(SMREToken[fn_name](_to, amount, {from: _from}));

            for (const _to of [role.early_investor1, role.early_investor2, role.nobody])
                for (const _from of [role.early_investor1, role.early_investor2, role.nobody])
                    for (const _by of [role.early_investor1, role.early_investor2, role.nobody])
                        for (const amount of [SMRE(2), SMRE(10)])
                            await expectThrow(SMREToken.transferFrom(_from, _to, amount, {from: _by}));
        }

        await SMREToken.mint(role.early_investor1, SMRE(10), {from: role.owner1});
        await checkNoTransfers();

        await SMREToken.mint(role.early_investor2, SMRE(2), {from: role.owner1});
        await checkNoTransfers();

        await SMREToken.mint(role.dev_fund, SMRE(38), {from: role.owner1});
        await checkNoTransfers();
    });

    // claim* functions are tested in SmartzTokenLifecycleManagerTest
});
