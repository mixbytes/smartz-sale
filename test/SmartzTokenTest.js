'use strict';

import {tokenUTest} from './utest/Token';
import {l} from './helpers/debug';
import expectThrow from './helpers/expectThrow';
import {assertBigNumberEqual} from './helpers/asserts';

const SmartzToken = artifacts.require('SmartzToken.sol');
const TestApprovalRecipient = artifacts.require('TestApprovalRecipient.sol');


async function instantiate(role, initial_balances_map) {
    const token = await SmartzToken.new([role.owner1], 1, {from: role.nobody});
    await token.setController(role.owner1, {from: role.owner1});

    for (const to_ in initial_balances_map)
        await token.mint(to_, initial_balances_map[to_], {from: role.owner1});

    return token;
}

async function startCirculation(role, token) {
    assert(await token.startCirculation({from: role.owner1}));
}

// converts amount of token into token-wei (smallest token units)
function SMTZ(amount) {
    return web3.toWei(amount, 'ether');
}


contract('SmartzTokenTest', function(accounts) {

    for (const [name, fn] of tokenUTest(accounts, instantiate, {
        burnable: true,

        startCirculationFn: startCirculation,

        mintFn: async function(role, token, to, amount) {
            await token.mint(to, amount, {from: role.owner1});
        },

        disableMintingFn: async function(role, token) {
            await token.disableMinting({from: role.owner1});
        }
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
        await startCirculation(role, token);
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
        const token = await SmartzToken.new([owner1, owner2, owner3], 2, {from: nobody});

        // owners set delegate to transfer tokens to early investors
        await token.setController(owner1, {from: owner1});
        await token.setController(owner1, {from: owner2});  // 2nd signature

        // early investment
        await token.mint(investor2, SMTZ(40), {from: owner1});
        assertBigNumberEqual(await token.balanceOf(investor2), SMTZ(40));
        await expectThrow(token.transfer(nobody, SMTZ(1), {from: investor2}));  // can't sell yet

        // ok, now it's ico time
        await token.setController(ico, {from: owner1});
        await token.setController(ico, {from: owner2});  // 2nd signature

        await expectThrow(token.mint(investor1, SMTZ(20), {from: owner1}));     // can no longer mint directly

        // minting by ico to an investor
        await token.mint(investor1, SMTZ(20), {from: ico});
        assertBigNumberEqual(await token.balanceOf(investor1), SMTZ(20));

        await expectThrow(token.transfer(nobody, SMTZ(1), {from: investor1}));  // both investors..
        await expectThrow(token.transfer(nobody, SMTZ(1), {from: investor2}));  // ..can't sell yet

        // checking that excess minting is not possible
        assertBigNumberEqual(await token.totalMinted(), SMTZ(60));
        await expectThrow(token.mint(investor1, SMTZ(200000000), {from: ico}));

        token.mint(investor1, SMTZ(150000000 - 60), {from: ico});
        assertBigNumberEqual(await token.totalSupply(), await token.MAX_SUPPLY());

        // ico is over
        await token.disableMinting({from: ico});
        await token.detachControllerForever({from: ico});

        await token.startCirculation({from: owner1});
        assert(await token.startCirculation({from: owner2}));   // 2nd signature

        // now transfer is allowed
        await token.transfer(nobody, SMTZ(1), {from: investor1});
        await token.transfer(nobody, SMTZ(1), {from: investor2});
        assertBigNumberEqual(await token.balanceOf(nobody), SMTZ(2));

        // and owners no longer have any power over the token contract
        await expectThrow(token.mint(investor1, SMTZ(20), {from: owner1}));
        await expectThrow(token.mint(owner1, SMTZ(20), {from: ico}));

        // trying to set controller again
        await token.setController(owner1, {from: owner1});  // 1st signature
        await expectThrow(token.setController(owner1, {from: owner2})); // 2nd signature - must fail
    });
});
