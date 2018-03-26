'use strict';

import {tokenUTest} from './utest/Token';
import {l} from './helpers/debug';
import expectThrow from './helpers/expectThrow';
import {assertBigNumberEqual} from './helpers/asserts';

const SmartzToken = artifacts.require('SmartzToken.sol');
const SmartzTokenTestHelper = artifacts.require('SmartzTokenTestHelper.sol');
const TestApprovalRecipient = artifacts.require('TestApprovalRecipient.sol');


async function instantiate(role, initial_balances_map) {
    const token = await SmartzToken.new([role.owner1], 1, {from: role.nobody});

    for (const to_ in initial_balances_map)
        await token.transfer(to_, initial_balances_map[to_], {from: role.nobody});

    const remaining = await token.balanceOf(role.nobody);
    await token.burn(remaining, {from: role.nobody});

    return token;
}

// converts amount of token into token-wei (smallest token units)
function SMTZ(amount) {
    return web3.toWei(amount, 'ether');
}


contract('SmartzTokenTest', function(accounts) {

    for (const [name, fn] of tokenUTest(accounts, instantiate, {
        burnable: true
    })) {
         it(name, fn);
    }

    it('test approveAndCall', async function() {
        const owner1 = accounts[0];
        const owner2 = accounts[1];
        const nobody = accounts[2];

        const initial_balances_map = {};
        initial_balances_map[owner1] = SMTZ(10);
        initial_balances_map[owner2] = SMTZ(3);

        const role = {owner1, nobody};
        const token = await instantiate(role, initial_balances_map);
        const recipient = await TestApprovalRecipient.new(token.address, {from: nobody});

        await token.approveAndCall(recipient.address, SMTZ(1), '', {from: owner1});
        assertBigNumberEqual(await recipient.m_bonuses(owner1), SMTZ(1));

        await token.approveAndCall(recipient.address, SMTZ(1), '0x4041', {from: owner2});
        assertBigNumberEqual(await recipient.m_bonuses(owner2), SMTZ(2));
        assertBigNumberEqual(await token.balanceOf(owner2), SMTZ(2));   // 3 - 1
    });

    it('test full lifecycle', async function() {
        const owner1 = accounts[0];
        const owner2 = accounts[1];
        const owner3 = accounts[2];
        const investor1 = accounts[2];  // owner receives some tokens case
        const investor2 = accounts[3];
        const ico = accounts[4];
        const nobody = accounts[5];

        // constructing token
        const token = await SmartzTokenTestHelper.new([owner1, owner2, owner3], 2, {from: owner1});
        await token.setTime(1520000000);

        await token.setSale(owner1, true, {from: owner1});
        await token.setSale(owner1, true, {from: owner2});  // 2nd signature

        // early investment
        await token.frozenTransfer(investor2, SMTZ(40), 1560000000, false, {from: owner1});
        assertBigNumberEqual(await token.balanceOf(investor2), SMTZ(40));
        assertBigNumberEqual(await token.availableBalanceOf(investor2), SMTZ(0));
        await expectThrow(token.transfer(nobody, SMTZ(1), {from: investor2}));  // can't sell yet

        // ok, now it's ico time
        await token.transfer(ico, SMTZ(1e6), {from: owner1});
        await token.setSale(ico, true, {from: owner1});
        await token.setSale(ico, true, {from: owner2});  // 2nd signature

        // minting by ico to an investor
        await token.frozenTransfer(investor1, SMTZ(20), 1550000000, false, {from: ico});
        assertBigNumberEqual(await token.balanceOf(investor1), SMTZ(20));

        await expectThrow(token.transfer(nobody, SMTZ(1), {from: investor1}));  // both investors..
        await expectThrow(token.transfer(nobody, SMTZ(1), {from: investor2}));  // ..can't sell yet

        // ico is over
        await token.disablePrivileged({from: owner1});
        await token.disablePrivileged({from: owner2});  // 2nd signature

        // now transfer is allowed
        await token.setTime(1560000000);
        await token.transfer(nobody, SMTZ(1), {from: investor1});
        await token.transfer(nobody, SMTZ(1), {from: investor2});
        assertBigNumberEqual(await token.balanceOf(nobody), SMTZ(2));

        // and owners no longer have any power over the token contract
        await expectThrow(token.frozenTransfer(investor2, SMTZ(40), 1590000000, false, {from: owner1}));
        await expectThrow(token.frozenTransfer(investor1, SMTZ(20), 1590000000, false, {from: ico}));
    });
});
