'use strict';

import {tokenUTest} from './utest/Token';
import {l} from './helpers/debug';
import expectThrow from './helpers/expectThrow';
import {assertBigNumberEqual} from './helpers/asserts';
import {withRollback} from './helpers/EVMSnapshots';

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
        const holder1 = accounts[2];  // owner receives some tokens case
        const holder2 = accounts[3];
        const holder3 = accounts[4];
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
        await token.frozenTransfer(holder2, SMTZ(40), 1560000000, false, {from: owner1});
        assertBigNumberEqual(await token.balanceOf(holder2), SMTZ(40));
        assertBigNumberEqual(await token.availableBalanceOf(holder2), SMTZ(0));
        await expectThrow(token.transfer(nobody, SMTZ(1), {from: holder2}));  // can't sell yet

        // ok, now it's ico time
        await token.transfer(ico, SMTZ(1e6), {from: owner1});
        await token.setSale(ico, true, {from: owner1});
        await token.setSale(ico, true, {from: owner2});  // 2nd signature

        // minting by ico to an holder
        await token.frozenTransfer(holder1, SMTZ(20), 1550000000, true, {from: ico});
        await KYC.setKYCPassed(holder1);
        assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(20));
        assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(0));

        await expectThrow(token.transfer(nobody, SMTZ(1), {from: holder1}));  // both holders..
        await expectThrow(token.transfer(nobody, SMTZ(1), {from: holder2}));  // ..can't sell yet

        // holder3
        await token.frozenTransfer(holder3, SMTZ(10), 1550000000, true, {from: ico});
        assertBigNumberEqual(await token.balanceOf(holder3), SMTZ(10));
        assertBigNumberEqual(await token.availableBalanceOf(holder3), SMTZ(0));
        await expectThrow(token.transfer(nobody, SMTZ(1), {from: holder3}));

        // ico is over - now transfer is allowed
        await token.setTime(1560000000);
        await token.transfer(nobody, SMTZ(1), {from: holder1});
        await token.transfer(nobody, SMTZ(1), {from: holder2});
        assertBigNumberEqual(await token.balanceOf(nobody), SMTZ(2));
        assertBigNumberEqual(await token.availableBalanceOf(nobody), SMTZ(2));

        assertBigNumberEqual(await token.balanceOf(holder2), SMTZ(39));
        assertBigNumberEqual(await token.availableBalanceOf(holder2), SMTZ(39));

        assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(19));
        assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(19));

        // refund
        // first attempt - not approved
        await expectThrow(token.frozenTransferFrom(holder3, ico, SMTZ(10), 1550000000, true, {from: ico}));

        await token.approve(ico, SMTZ(10), {from: holder3});
        await token.frozenTransferFrom(holder3, ico, SMTZ(10), 1550000000, true, {from: ico});
        assertBigNumberEqual(await token.balanceOf(holder3), SMTZ(0));
        assertBigNumberEqual(await token.availableBalanceOf(holder3), SMTZ(0));
        await expectThrow(token.transfer(nobody, SMTZ(1), {from: holder3}));

        // no more privileged frozen* calls
        await token.disablePrivileged({from: owner1});
        await token.disablePrivileged({from: owner2});  // 2nd signature

        // and owners no longer have any power over the token contract
        await expectThrow(token.frozenTransfer(holder2, SMTZ(40), 1590000000, false, {from: owner1}));
        await expectThrow(token.frozenTransfer(holder1, SMTZ(20), 1590000000, false, {from: ico}));

        // totals
        assertBigNumberEqual(await token.totalSupply(), SMTZ(150e6));
        let sum = new web3.BigNumber(0);
        for (const role of [owner1, owner2, holder1, holder2, holder3, ico, nobody])
            sum = sum.add(await token.availableBalanceOf(role));
        assertBigNumberEqual(sum, SMTZ(150e6));
    });

    it('test token freezing', async function() {
        const owner1 = accounts[0];
        const holder1 = accounts[1];
        const holder2 = accounts[2];
        const holder3 = accounts[3];

        const token = await SmartzTokenTestHelper.new([owner1], 1, {from: owner1});
        await token.setSale(owner1, true, {from: owner1});
        await token.setTime(1600000001);
        await token.approve(owner1, SMTZ(1e6), {from: holder1});

        const KYC = await TestKYCProvider.new();
        await token.setKYCProvider(KYC.address, {from: owner1});

        // holder1 <- 5 (thaw = 1600000005, KYC = false)
        await token.frozenTransfer(holder1, SMTZ(5), 1600000005, false, {from: owner1});
        assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(5));
        assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(0));

        // holder1 <- 7 (thaw = 1600000005, KYC = true)
        await token.frozenTransfer(holder1, SMTZ(7), 1600000005, true, {from: owner1});
        assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(12));
        assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(0));

        await expectThrow(token.transfer(holder2, SMTZ(1), {from: holder1}));

        await withRollback(async () => {
            // no such tokens
            await expectThrow(token.frozenTransferFrom(holder1, owner1, SMTZ(1), 1700000000, false, {from: owner1}));

            // not enough tokens which are (thaw = 1600000005, KYC = false)
            await expectThrow(token.frozenTransferFrom(holder1, owner1, SMTZ(6), 1600000005, false, {from: owner1}));

            // not a sale
            await expectThrow(token.frozenTransferFrom(holder1, holder3, SMTZ(1), 1600000005, true, {from: owner1}));
            await expectThrow(token.frozenTransferFrom(holder1, owner1, SMTZ(1), 1600000005, true, {from: holder1}));
            await expectThrow(token.frozenTransferFrom(holder1, holder3, SMTZ(1), 1600000005, true, {from: holder1}));

            await expectThrow(token.frozenTransfer(holder3, SMTZ(1), 1600000005, false, {from: holder1}));
            await expectThrow(token.frozenTransfer(holder3, SMTZ(1), 1600000005, true, {from: holder1}));
            await expectThrow(token.frozenTransfer(holder3, SMTZ(1), 1600000010, false, {from: holder1}));
            await expectThrow(token.frozenTransfer(holder3, SMTZ(1), 1600000010, true, {from: holder1}));

            // there are enough tokens which are (thaw = 1600000005, KYC = true)
            await token.frozenTransferFrom(holder1, owner1, SMTZ(6), 1600000005, true, {from: owner1});
            assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(6));
            assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(0));
        });


        await token.setTime(1600000002);

        // holder1 <- 1 (thaw = 1600000005, KYC = false)
        await token.frozenTransfer(holder1, SMTZ(1), 1600000005, false, {from: owner1});
        assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(13));
        assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(0));

        // holder1 <- 2 (thaw = 1600000005, KYC = true)
        await token.frozenTransfer(holder1, SMTZ(2), 1600000005, true, {from: owner1});
        assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(15));
        assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(0));

        // checking various frozen transferFrom calls
        await withRollback(async () => {
            await token.frozenTransferFrom(holder1, owner1, SMTZ(6), 1600000005, false, {from: owner1});
            assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(9));
        });

        await withRollback(async () => {
            await token.frozenTransferFrom(holder1, owner1, SMTZ(2), 1600000005, false, {from: owner1});
            await token.frozenTransferFrom(holder1, owner1, SMTZ(4), 1600000005, false, {from: owner1});
            assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(9));
        });

        await withRollback(async () => {
            await token.frozenTransferFrom(holder1, owner1, SMTZ(9), 1600000005, true, {from: owner1});
            assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(6));
        });

        await withRollback(async () => {
            await token.frozenTransferFrom(holder1, owner1, SMTZ(3), 1600000005, true, {from: owner1});
            await token.frozenTransferFrom(holder1, owner1, SMTZ(6), 1600000005, true, {from: owner1});
            assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(6));
        });

        await expectThrow(token.transfer(holder2, SMTZ(1), {from: holder1}));

        // some tokens are unfrozen
        await token.setTime(1600000006);

        assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(15));
        assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(6));

        await withRollback(async () => {
            await expectThrow(token.transfer(holder2, SMTZ(100), {from: holder1}));

            // entire cell could be transferred
            await token.transfer(holder2, SMTZ(6), {from: holder1});
            assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(9));
            assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(0));

            assertBigNumberEqual(await token.balanceOf(holder2), SMTZ(6));
            assertBigNumberEqual(await token.availableBalanceOf(holder2), SMTZ(6));
        });

        await withRollback(async () => {
            // transfer of thaw + regular tokens
            await token.transfer(holder1, SMTZ(10), {from: owner1});
            assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(25));
            assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(16));

            await expectThrow(token.transfer(holder2, SMTZ(100), {from: holder1}));

            await token.transfer(holder2, SMTZ(13), {from: holder1});
            assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(12));
            assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(3));

            assertBigNumberEqual(await token.balanceOf(holder2), SMTZ(13));
            assertBigNumberEqual(await token.availableBalanceOf(holder2), SMTZ(13));
        });

        await withRollback(async () => {
            // transfer of regular tokens (not touching frozen tokens)
            await token.transfer(holder1, SMTZ(10), {from: owner1});

            await token.transfer(holder2, SMTZ(2), {from: holder1});
            assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(23));
            assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(14));

            assertBigNumberEqual(await token.balanceOf(holder2), SMTZ(2));
            assertBigNumberEqual(await token.availableBalanceOf(holder2), SMTZ(2));
        });

        await withRollback(async () => {
            // multiple transfers
            await token.transfer(holder2, SMTZ(2), {from: holder1});
            assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(13));
            assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(4));

            assertBigNumberEqual(await token.balanceOf(holder2), SMTZ(2));
            assertBigNumberEqual(await token.availableBalanceOf(holder2), SMTZ(2));

            await expectThrow(token.transfer(holder2, SMTZ(5), {from: holder1}));
            await token.transfer(holder2, SMTZ(4), {from: holder1});
            assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(9));
            assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(0));

            assertBigNumberEqual(await token.balanceOf(holder2), SMTZ(6));
            assertBigNumberEqual(await token.availableBalanceOf(holder2), SMTZ(6));
        });

        await expectThrow(token.transfer(holder2, SMTZ(100), {from: holder1}));

        // transferFrom
        await token.approve(holder3, SMTZ(1e6), {from: holder1});

        await withRollback(async () => {
            await expectThrow(token.transferFrom(holder1, holder2, SMTZ(100), {from: holder3}));

            // entire cell could be transferred
            await token.transferFrom(holder1, holder2, SMTZ(6), {from: holder3});
            assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(9));
            assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(0));

            assertBigNumberEqual(await token.balanceOf(holder2), SMTZ(6));
            assertBigNumberEqual(await token.availableBalanceOf(holder2), SMTZ(6));
        });

        await token.transferFrom(holder1, holder2, SMTZ(2), {from: holder3});
        assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(13));
        assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(4));

        assertBigNumberEqual(await token.balanceOf(holder2), SMTZ(2));
        assertBigNumberEqual(await token.availableBalanceOf(holder2), SMTZ(2));

        await expectThrow(token.transferFrom(holder1, holder2, SMTZ(5), {from: holder3}));
        await token.transferFrom(holder1, holder2, SMTZ(2), {from: holder3});
        assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(11));
        assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(2));

        assertBigNumberEqual(await token.balanceOf(holder2), SMTZ(4));
        assertBigNumberEqual(await token.availableBalanceOf(holder2), SMTZ(4));

        // further unfreezing
        await KYC.setKYCPassed(holder1);
        assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(11));
        assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(11));
        await expectThrow(token.transfer(holder3, SMTZ(100), {from: holder1}));

        await withRollback(async () => {
            // single transfer
            await token.transfer(holder3, SMTZ(11), {from: holder1});

            assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(0));
            assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(0));

            assertBigNumberEqual(await token.balanceOf(holder3), SMTZ(11));
            assertBigNumberEqual(await token.availableBalanceOf(holder3), SMTZ(11));
        });

        // multiple transfers
        await expectThrow(token.transfer(holder3, SMTZ(12), {from: holder1}));
        await token.transfer(holder3, SMTZ(9), {from: holder1});

        assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(2));
        assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(2));

        assertBigNumberEqual(await token.balanceOf(holder3), SMTZ(9));
        assertBigNumberEqual(await token.availableBalanceOf(holder3), SMTZ(9));

        await expectThrow(token.transfer(holder3, SMTZ(3), {from: holder1}));
        await token.transfer(holder3, SMTZ(2), {from: holder1});

        assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(0));
        assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(0));

        assertBigNumberEqual(await token.balanceOf(holder3), SMTZ(11));
        assertBigNumberEqual(await token.availableBalanceOf(holder3), SMTZ(11));
    });

    it('test viewing frozen cells', async function() {
        const assertCellContent = (cell, amount, ts, isKYC) => {
            assertBigNumberEqual(cell[0], amount);
            assertBigNumberEqual(cell[1], ts);
            assert.equal(cell[2], isKYC);
        };

        const owner1 = accounts[0];
        const holder1 = accounts[1];

        const token = await SmartzTokenTestHelper.new([owner1], 1, {from: owner1});
        await token.setSale(owner1, true, {from: owner1});
        await token.setTime(1600000001);

        // holder1 <- 5 (thaw = 1600000005, KYC = false)
        assertBigNumberEqual(await token.frozenCellCount(holder1), 0);

        await token.frozenTransfer(holder1, SMTZ(5), 1600000005, false, {from: owner1});
        assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(5));
        assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(0));

        assertBigNumberEqual(await token.frozenCellCount(holder1), 1);
        assertCellContent(await token.frozenCell(holder1, 0), SMTZ(5), 1600000005, false);

        // holder1 <- 7 (thaw = 1600000005, KYC = true)
        await token.frozenTransfer(holder1, SMTZ(7), 1600000005, true, {from: owner1});
        assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(12));
        assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(0));

        assertBigNumberEqual(await token.frozenCellCount(holder1), 2);
        assertCellContent(await token.frozenCell(holder1, 0), SMTZ(5), 1600000005, false);
        assertCellContent(await token.frozenCell(holder1, 1), SMTZ(7), 1600000005, true);


        await token.setTime(1600000002);

        // holder1 <- 1 (thaw = 1600000005, KYC = false)
        await token.frozenTransfer(holder1, SMTZ(1), 1600000005, false, {from: owner1});
        assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(13));
        assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(0));

        assertBigNumberEqual(await token.frozenCellCount(holder1), 2);
        assertCellContent(await token.frozenCell(holder1, 0), SMTZ(6), 1600000005, false);
        assertCellContent(await token.frozenCell(holder1, 1), SMTZ(7), 1600000005, true);

        // holder1 <- 2 (thaw = 1600000005, KYC = true)
        await token.frozenTransfer(holder1, SMTZ(2), 1600000005, true, {from: owner1});
        assertBigNumberEqual(await token.balanceOf(holder1), SMTZ(15));
        assertBigNumberEqual(await token.availableBalanceOf(holder1), SMTZ(0));

        assertBigNumberEqual(await token.frozenCellCount(holder1), 2);
        assertCellContent(await token.frozenCell(holder1, 0), SMTZ(6), 1600000005, false);
        assertCellContent(await token.frozenCell(holder1, 1), SMTZ(9), 1600000005, true);
    });
});
