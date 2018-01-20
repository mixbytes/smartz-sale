'use strict';

import {tokenUTest} from './utest/Token';
import {l} from './helpers/debug';

const SmartzToken = artifacts.require('SmartzToken.sol');


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

});
