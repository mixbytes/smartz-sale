'use strict';

import {l} from './helpers/debug';
import expectThrow from './helpers/expectThrow';
import {assertBigNumberEqual} from './helpers/asserts';
import {withRollback} from './helpers/EVMSnapshots';

const SmartzTokenTestHelper = artifacts.require('SmartzTokenTestHelper.sol');
const SMRDistributionVault = artifacts.require('SMRDistributionVault.sol');


function getRoles(accounts) {
    return {
        owner3: accounts[0],
        owner1: accounts[1],
        owner2: accounts[2],
        holder1: accounts[3],
        holder2: accounts[4],
        nobody: accounts[5]
    };
}

async function instantiate(role) {
    const token = await SmartzTokenTestHelper.new([role.owner1], 1, {from: role.owner1});
    await token.setTime(1600000000);

    const vault = await SMRDistributionVault.new([role.owner2, role.owner3], token.address, 1600000010, {from: role.nobody});
    await token.setSale(vault.address, true, {from: role.owner1});  // needs special status to freeze tokens!
    await token.transfer(vault.address, SMR(1000), {from: role.owner1});

    return [token, vault];
}

// converts amount of token into token-wei (smallest token units)
function SMR(amount) {
    return web3.toWei(amount, 'ether');
}


contract('SMRDistributionVaultTest', function(accounts) {

    it('test instantiate', async function() {
        const role = getRoles(accounts);
        const [token, vault] = await instantiate(role);
    });

    it('test decimals', async function() {
        const role = getRoles(accounts);
        const [token, vault] = await instantiate(role);
        assert.equal(await vault.decimals(), 18);
    });

    it('test balanceOf', async function() {
        const role = getRoles(accounts);
        const [token, vault] = await instantiate(role);

        for (const from_ of [role.owner1, role.owner2, role.nobody]) {
            assertBigNumberEqual(await vault.balanceOf(role.owner1, {from: from_}), SMR(0));
            assertBigNumberEqual(await vault.balanceOf(role.nobody, {from: from_}), SMR(0));
            assertBigNumberEqual(await vault.balanceOf(role.owner2, {from: from_}), SMR(1000));
            assertBigNumberEqual(await vault.balanceOf(role.owner3, {from: from_}), SMR(1000));
        }

        // transfer from vault by owner2
        await vault.transfer(role.holder1, SMR(100), {from: role.owner2});

        for (const from_ of [role.owner1, role.owner2, role.nobody]) {
            assertBigNumberEqual(await vault.balanceOf(role.owner1, {from: from_}), SMR(0));
            assertBigNumberEqual(await vault.balanceOf(role.nobody, {from: from_}), SMR(0));
            assertBigNumberEqual(await vault.balanceOf(role.owner2, {from: from_}), SMR(900));
            assertBigNumberEqual(await vault.balanceOf(role.owner3, {from: from_}), SMR(900));
        }

        // transfer from vault by owner3
        await vault.transfer(role.holder2, SMR(50), {from: role.owner3});

        for (const from_ of [role.owner1, role.owner2, role.nobody]) {
            assertBigNumberEqual(await vault.balanceOf(role.owner1, {from: from_}), SMR(0));
            assertBigNumberEqual(await vault.balanceOf(role.nobody, {from: from_}), SMR(0));
            assertBigNumberEqual(await vault.balanceOf(role.owner2, {from: from_}), SMR(850));
            assertBigNumberEqual(await vault.balanceOf(role.owner3, {from: from_}), SMR(850));
        }
    });

    it('test transfer', async function() {
        const role = getRoles(accounts);
        const [token, vault] = await instantiate(role);

        assertBigNumberEqual(await token.balanceOf(vault.address), SMR(1000));
        assertBigNumberEqual(await token.availableBalanceOf(vault.address), SMR(1000));
        assertBigNumberEqual(await token.balanceOf(role.owner2), SMR(0));
        assertBigNumberEqual(await token.balanceOf(role.owner3), SMR(0));

        // transfer from vault by owner2
        await vault.transfer(role.holder1, SMR(100), {from: role.owner2});
        assertBigNumberEqual(await token.balanceOf(role.holder1), SMR(100));
        assertBigNumberEqual(await token.availableBalanceOf(role.holder1), SMR(0)); // frozen!

        assertBigNumberEqual(await token.balanceOf(vault.address), SMR(900));
        assertBigNumberEqual(await token.availableBalanceOf(vault.address), SMR(900));
        assertBigNumberEqual(await token.balanceOf(role.owner2), SMR(0));
        assertBigNumberEqual(await token.balanceOf(role.owner3), SMR(0));

        for (const from_ of [role.owner1, role.nobody, role.holder1])
            await expectThrow(vault.transfer(from_, SMR(100), {from: from_}));

        // transfer from vault by owner3
        await vault.transfer(role.holder2, SMR(50), {from: role.owner3});
        assertBigNumberEqual(await token.balanceOf(role.holder1), SMR(100));
        assertBigNumberEqual(await token.balanceOf(role.holder2), SMR(50));
        assertBigNumberEqual(await token.availableBalanceOf(role.holder2), SMR(0)); // frozen!

        assertBigNumberEqual(await token.balanceOf(vault.address), SMR(850));
        assertBigNumberEqual(await token.availableBalanceOf(vault.address), SMR(850));
        assertBigNumberEqual(await token.balanceOf(role.owner2), SMR(0));
        assertBigNumberEqual(await token.balanceOf(role.owner3), SMR(0));

        // Thaw time
        await token.setTime(1600000011);

        assertBigNumberEqual(await token.availableBalanceOf(role.holder1), SMR(100));
        assertBigNumberEqual(await token.availableBalanceOf(role.holder2), SMR(50));

        assertBigNumberEqual(await token.balanceOf(vault.address), SMR(850));
        assertBigNumberEqual(await token.availableBalanceOf(vault.address), SMR(850));
        assertBigNumberEqual(await token.balanceOf(role.owner2), SMR(0));
        assertBigNumberEqual(await token.balanceOf(role.owner3), SMR(0));

        for (const from_ of [role.owner1, role.nobody, role.holder1])
            await expectThrow(vault.transfer(from_, SMR(100), {from: from_}));
    });

    it('test withdrawRemaining', async function() {
        const role = getRoles(accounts);
        const [token, vault] = await instantiate(role);

        for (const from_ of [role.owner1, role.nobody, role.holder1])
            await expectThrow(vault.withdrawRemaining(from_, {from: from_}));

        await vault.transfer(role.holder1, SMR(100), {from: role.owner2});
        await vault.transfer(role.holder2, SMR(50), {from: role.owner2});

        for (const from_ of [role.owner1, role.nobody, role.holder1])
            await expectThrow(vault.withdrawRemaining(from_, {from: from_}));

        await vault.withdrawRemaining(role.owner3, {from: role.owner3});
        assertBigNumberEqual(await token.balanceOf(role.owner3), SMR(850));
        assertBigNumberEqual(await token.availableBalanceOf(role.owner3), SMR(850));    // not frozen!
    });
});
