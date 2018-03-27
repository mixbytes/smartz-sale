'use strict';

import {tokenUTest} from './utest/Token';
import {l} from './helpers/debug';
import expectThrow from './helpers/expectThrow';
import {assertBigNumberEqual} from './helpers/asserts';

const SmartzToken = artifacts.require('SmartzToken.sol');
const SmartzTokenTestHelper = artifacts.require('SmartzTokenTestHelper.sol');
const TestApprovalRecipient = artifacts.require('TestApprovalRecipient.sol');
const TestKYCProvider = artifacts.require('TestKYCProvider.sol');


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
        const investor3 = accounts[4];
        const ico = accounts[5];
        const nobody = accounts[6];

        // constructing token
        const token = await SmartzTokenTestHelper.new([owner1, owner2, owner3], 2, {from: owner1});
        await token.setTime(1520000000);
        assertBigNumberEqual(await token.availableBalanceOf(owner1), SMTZ(150e6));
        assertBigNumberEqual(await token.balanceOf(owner1), SMTZ(150e6));
        assertBigNumberEqual(await token.totalSupply(), SMTZ(150e6));

        const KYC = await TestKYCProvider.new();
        await token.setKYCProvider(KYC.address, {from: owner1});
        await token.setKYCProvider(KYC.address, {from: owner2});    // 2nd signature

        await token.setSale(owner1, true, {from: owner1});
        await token.setSale(owner1, true, {from: owner2});  // 2nd signature

        // early investment
        await token.frozenTransfer(investor2, SMTZ(40), 1560000000, true, {from: owner1});
        KYC.setKYCPassed(investor2);
        assertBigNumberEqual(await token.balanceOf(investor2), SMTZ(40));
        assertBigNumberEqual(await token.availableBalanceOf(investor2), SMTZ(0));
        await expectThrow(token.transfer(nobody, SMTZ(1), {from: investor2}));  // can't sell yet

        // ok, now it's ico time
        await token.transfer(ico, SMTZ(1e6), {from: owner1});
        await token.setSale(ico, true, {from: owner1});
        await token.setSale(ico, true, {from: owner2});  // 2nd signature

        // minting by ico to an investor
        await token.frozenTransfer(investor1, SMTZ(20), 1550000000, true, {from: ico});
        KYC.setKYCPassed(investor1);
        assertBigNumberEqual(await token.balanceOf(investor1), SMTZ(20));
        assertBigNumberEqual(await token.availableBalanceOf(investor1), SMTZ(0));

        await expectThrow(token.transfer(nobody, SMTZ(1), {from: investor1}));  // both investors..
        await expectThrow(token.transfer(nobody, SMTZ(1), {from: investor2}));  // ..can't sell yet

        // investor3
        await token.frozenTransfer(investor3, SMTZ(10), 1550000000, true, {from: ico});
        assertBigNumberEqual(await token.balanceOf(investor3), SMTZ(10));
        assertBigNumberEqual(await token.availableBalanceOf(investor3), SMTZ(0));
        await expectThrow(token.transfer(nobody, SMTZ(1), {from: investor3}));

        // ico is over - now transfer is allowed
        await token.setTime(1560000000);
        await token.transfer(nobody, SMTZ(1), {from: investor1});
        await token.transfer(nobody, SMTZ(1), {from: investor2});
        assertBigNumberEqual(await token.balanceOf(nobody), SMTZ(2));
        assertBigNumberEqual(await token.availableBalanceOf(nobody), SMTZ(2));

        assertBigNumberEqual(await token.balanceOf(investor2), SMTZ(39));
        assertBigNumberEqual(await token.availableBalanceOf(investor2), SMTZ(39));

        assertBigNumberEqual(await token.balanceOf(investor1), SMTZ(19));
        assertBigNumberEqual(await token.availableBalanceOf(investor1), SMTZ(19));

        // refund
        // first attempt - not approved
        await expectThrow(token.frozenTransferFrom(investor3, ico, SMTZ(10), 1550000000, true, {from: ico}));

        await token.approve(ico, SMTZ(10), {from: investor3});
        await token.frozenTransferFrom(investor3, ico, SMTZ(10), 1550000000, true, {from: ico});
        assertBigNumberEqual(await token.balanceOf(investor3), SMTZ(0));
        assertBigNumberEqual(await token.availableBalanceOf(investor3), SMTZ(0));
        await expectThrow(token.transfer(nobody, SMTZ(1), {from: investor3}));

        // no more privileged frozen* calls
        await token.disablePrivileged({from: owner1});
        await token.disablePrivileged({from: owner2});  // 2nd signature

        // and owners no longer have any power over the token contract
        await expectThrow(token.frozenTransfer(investor2, SMTZ(40), 1590000000, false, {from: owner1}));
        await expectThrow(token.frozenTransfer(investor1, SMTZ(20), 1590000000, false, {from: ico}));

        // totals
        assertBigNumberEqual(await token.totalSupply(), SMTZ(150e6));
        let sum = new web3.BigNumber(0);
        for (const role of [owner1, owner2, investor1, investor2, investor3, ico, nobody])
            sum = sum.add(await token.availableBalanceOf(role));
        assertBigNumberEqual(sum, SMTZ(150e6));
    });
});
