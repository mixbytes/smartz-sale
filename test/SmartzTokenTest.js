'use strict';

import {tokenUTest} from './utest/Token';
import {l} from './helpers/debug';

const SmartzToken = artifacts.require('SmartzToken.sol');
const TestApprovalRecipient = artifacts.require('TestApprovalRecipient.sol');


async function instantiate(role, initial_balances_map) {
    const token = await SmartzToken.new({from: role.owner1});

    for (const to_ in initial_balances_map)
        await token.transfer(to_, initial_balances_map[to_], {from: role.owner1});

    let excessTokens = await token.balanceOf(role.owner1);
    if (role.owner1 in initial_balances_map)
        excessTokens = excessTokens.sub(initial_balances_map[role.owner1]);

    await token.burn(excessTokens, {from: role.owner1});

    return token;
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

        const token = await SmartzToken.new({from: owner1});
        const recipient = await TestApprovalRecipient.new(token.address, {from: nobody});

        await token.transfer(owner2, web3.toWei(3, 'ether'), {from: owner1});

        await token.approveAndCall(recipient.address, web3.toWei(1, 'ether'), '', {from: owner1});
        assert((await recipient.m_bonuses(owner1)).eq(web3.toWei(1, 'ether')));

        await token.approveAndCall(recipient.address, web3.toWei(1, 'ether'), '0x4041', {from: owner2});
        assert((await recipient.m_bonuses(owner2)).eq(web3.toWei(2, 'ether')));
        assert((await token.balanceOf(owner2)).eq(web3.toWei(2, 'ether')));
    });
});
