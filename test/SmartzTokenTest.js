'use strict';

import {tokenUTest} from './utest/Token';
import {l} from './helpers/debug';

const SmartzToken = artifacts.require('SmartzToken.sol');
const TestApprovalRecipient = artifacts.require('TestApprovalRecipient.sol');


async function instantiate(role, initial_balances_map) {
    const token = await SmartzToken.new([role.owner1], 1, {from: role.nobody});
    await token.setController(role.owner1, {from: role.owner1});

    for (const to_ in initial_balances_map)
        await token.mint(to_, initial_balances_map[to_], {from: role.owner1});

    return token;
}

async function startCirculationDirect(token) {
    const controller = await token.m_controller();
    assert(await token.startCirculation({from: controller}));
}


contract('SmartzTokenTest', function(accounts) {

    for (const [name, fn] of tokenUTest(accounts, instantiate, {
        burnable: true,

        startCirculationFn: async function(role, token) {
            await startCirculationDirect(token);
        },

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
        initial_balances_map[owner1] = web3.toWei(10, 'ether');
        initial_balances_map[owner2] = web3.toWei(3, 'ether');

        const token = await instantiate({owner1: owner1, nobody: nobody}, initial_balances_map);
        await startCirculationDirect(token);
        const recipient = await TestApprovalRecipient.new(token.address, {from: nobody});

        await token.approveAndCall(recipient.address, web3.toWei(1, 'ether'), '', {from: owner1});
        assert((await recipient.m_bonuses(owner1)).eq(web3.toWei(1, 'ether')));

        await token.approveAndCall(recipient.address, web3.toWei(1, 'ether'), '0x4041', {from: owner2});
        assert((await recipient.m_bonuses(owner2)).eq(web3.toWei(2, 'ether')));
        assert((await token.balanceOf(owner2)).eq(web3.toWei(2, 'ether')));
    });
});
