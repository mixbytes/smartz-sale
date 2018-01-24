'use strict';

import {l} from './helpers/debug';
import expectThrow from './helpers/expectThrow';
import {assertBigNumberEqual} from './helpers/asserts';
import {SMR, SMRE} from './helpers/smartz';

const SmartzToken = artifacts.require('SmartzToken.sol');
const SmartzTokenLifecycleManager = artifacts.require('SmartzTokenLifecycleManager.sol');
const SmartzTokenEmissionPools = artifacts.require('SmartzTokenEmissionPools.sol');


contract('SmartzTokenLifecycleManagerTest', function(accounts) {
    const role = {
        nobody: accounts[0],
        owner1: accounts[1],
        sale: accounts[2],
        early_investor: accounts[3],
        dev_fund: accounts[4],
        investor: accounts[5],
        investor2: '0x0000000000000000000000000000000000000001',
        early_investor2: '0x0000000000000000000000000000000000000002'
    };

    async function instantiate() {
        const SMRToken = await SmartzToken.new([role.owner1], 1, {from: role.nobody});

        const LCManager = await SmartzTokenLifecycleManager.new([role.owner1], 1, SMRToken.address, {from: role.nobody});
        await SMRToken.setController(LCManager.address, {from: role.owner1});

        const SMREToken = await SmartzTokenEmissionPools.new([role.owner1], 1, LCManager.address, {from: role.nobody});
        await LCManager.setPools(SMREToken.address, {from: role.owner1});

        await LCManager.setSale(role.sale, {from: role.owner1});

        return [SMRToken, LCManager, SMREToken];
    }


    it('test full lifecycle', async function() {
        const [SMRToken, LCManager, SMREToken] = await instantiate();

        // mint SMRE
        await SMREToken.mint(role.early_investor, SMRE(10), {from: role.owner1});
        await SMREToken.mint(role.early_investor2, SMRE(10), {from: role.owner1});
        await SMREToken.mint(role.early_investor, SMRE(5), {from: role.owner1});

        assertBigNumberEqual(await SMREToken.balanceOf(role.early_investor), SMRE(15));
        assertBigNumberEqual(await SMREToken.balanceOf(role.early_investor2), SMRE(10));
        assertBigNumberEqual(await SMREToken.totalSupply(), SMRE(25));

        // mint SMR
        await LCManager.mint(role.investor, SMR(1200), {from: role.sale});
        await LCManager.mint(role.investor2, SMR(300), {from: role.sale});
        await LCManager.mint(role.investor, SMR(1000), {from: role.sale});

        assertBigNumberEqual(await SMRToken.balanceOf(role.investor), SMR(2200));
        assertBigNumberEqual(await SMRToken.balanceOf(role.investor2), SMR(300));
        assertBigNumberEqual(await SMRToken.totalSupply(), SMR(2500));

        // mint remaining SMRE
        await SMREToken.mint(role.dev_fund, SMRE(25), {from: role.owner1});

        // end of public sales
        await LCManager.detach({from: role.sale});
        await LCManager.setSalesFinished({from: role.owner1});

        // claiming SMRE
        await SMREToken.claimSMRforAll(100, {from: role.nobody});

        assertBigNumberEqual(await SMRToken.balanceOf(role.investor), SMR(2200));
        assertBigNumberEqual(await SMRToken.balanceOf(role.investor2), SMR(300));

        assertBigNumberEqual(await SMRToken.balanceOf(role.early_investor), SMR(750));
        assertBigNumberEqual(await SMRToken.balanceOf(role.early_investor2), SMR(500));
        assertBigNumberEqual(await SMRToken.balanceOf(role.dev_fund), SMR(1250));

        assertBigNumberEqual(await SMRToken.totalSupply(), SMR(5000));
    });

    it('test premature claiming is forbidden', async function() {
        const [SMRToken, LCManager, SMREToken] = await instantiate();

        await SMREToken.mint(role.early_investor, SMRE(10), {from: role.owner1});
        await expectThrow(SMREToken.claimSMR({from: role.early_investor}));
        await expectThrow(SMREToken.claimSMRforAll(100, {from: role.nobody}));

        await SMREToken.mint(role.dev_fund, SMRE(40), {from: role.owner1});

        await expectThrow(SMREToken.claimSMR({from: role.early_investor}));
        await expectThrow(SMREToken.claimSMRforAll(100, {from: role.nobody}));
        await expectThrow(SMREToken.claimSMR({from: role.early_investor}));
    });

    it('cant claim if SMRE are not fully distributed', async function() {
        const [SMRToken, LCManager, SMREToken] = await instantiate();

        await SMREToken.mint(role.early_investor, SMRE(10), {from: role.owner1});

        await LCManager.mint(role.investor, SMR(1200), {from: role.sale});

        // end of public sales
        await LCManager.detach({from: role.sale});
        await LCManager.setSalesFinished({from: role.owner1});

        await expectThrow(SMREToken.claimSMR({from: role.early_investor}));
        await expectThrow(SMREToken.claimSMRforAll(100, {from: role.nobody}));
        await expectThrow(SMREToken.claimSMR({from: role.early_investor}));
    });

    it('cant mint to public after sales was finished', async function() {
        const [SMRToken, LCManager, SMREToken] = await instantiate();

        await SMREToken.mint(role.early_investor, SMRE(10), {from: role.owner1});

        await LCManager.mint(role.investor, SMR(1200), {from: role.sale});

        await SMREToken.mint(role.dev_fund, SMRE(40), {from: role.owner1});

        // end of public sales
        await LCManager.setSalesFinished({from: role.owner1});

        for (const to_ of [role.investor, role.owner1])
            await expectThrow(LCManager.mint(to_, SMR(200), {from: role.sale}));
    });

    it('cant mint to public after sale detached', async function() {
        const [SMRToken, LCManager, SMREToken] = await instantiate();

        await SMREToken.mint(role.early_investor, SMRE(10), {from: role.owner1});

        await LCManager.mint(role.investor, SMR(1200), {from: role.sale});

        await SMREToken.mint(role.dev_fund, SMRE(40), {from: role.owner1});

        await LCManager.detach({from: role.sale});

        for (const to_ of [role.investor, role.owner1])
            await expectThrow(LCManager.mint(to_, SMR(200), {from: role.sale}));
    });

    it('test minting SMR and SMRE to the same account', async function() {
        const [SMRToken, LCManager, SMREToken] = await instantiate();

        await SMREToken.mint(role.early_investor, SMRE(8), {from: role.owner1});
        await SMREToken.mint(role.investor, SMRE(1), {from: role.owner1});
        await SMREToken.mint(role.investor, SMRE(1), {from: role.owner1});

        await LCManager.mint(role.early_investor, SMR(1200), {from: role.sale});
        await LCManager.mint(role.investor, SMR(200), {from: role.sale});
        await LCManager.mint(role.investor, SMR(100), {from: role.sale});

        await SMREToken.mint(role.dev_fund, SMRE(40), {from: role.owner1});

        // end of public sales
        await LCManager.detach({from: role.sale});
        await LCManager.setSalesFinished({from: role.owner1});

        await SMREToken.claimSMRforAll(100, {from: role.nobody});

        assertBigNumberEqual(await SMRToken.balanceOf(role.early_investor), SMR(1200 + 240));
        assertBigNumberEqual(await SMRToken.balanceOf(role.investor), SMR(300 + 60));

        assertBigNumberEqual(await SMRToken.balanceOf(role.dev_fund), SMR(1200));

        assertBigNumberEqual(await SMRToken.totalSupply(), SMR(3000));
    });

    it('test late setting of sale and pools is forbidden', async function() {
        const [SMRToken, LCManager, SMREToken] = await instantiate();

        await SMREToken.mint(role.early_investor, SMRE(10), {from: role.owner1});

        await LCManager.mint(role.investor, SMR(1200), {from: role.sale});

        await SMREToken.mint(role.dev_fund, SMRE(40), {from: role.owner1});

        // end of public sales
        await LCManager.detach({from: role.sale});
        await LCManager.setSalesFinished({from: role.owner1});

        await expectThrow(LCManager.setSale(role.nobody), {from: role.owner1});
        await expectThrow(LCManager.setPools(role.nobody), {from: role.owner1});

        await SMREToken.claimSMRforAll(100, {from: role.nobody});

        await expectThrow(LCManager.setSale(role.nobody), {from: role.owner1});
        await expectThrow(LCManager.setPools(role.nobody), {from: role.owner1});
    });

    it('test second call to setSalesFinished is forbidden', async function() {
        const [SMRToken, LCManager, SMREToken] = await instantiate();

        await SMREToken.mint(role.early_investor, SMRE(10), {from: role.owner1});

        await LCManager.mint(role.investor, SMR(1200), {from: role.sale});

        await SMREToken.mint(role.dev_fund, SMRE(40), {from: role.owner1});

        // end of public sales
        await LCManager.detach({from: role.sale});
        await LCManager.setSalesFinished({from: role.owner1});

        await SMREToken.claimSMR({from: role.early_investor});

        await expectThrow(LCManager.setSalesFinished({from: role.owner1}));

        await SMREToken.claimSMRforAll(100, {from: role.nobody});

        await expectThrow(LCManager.setSalesFinished({from: role.owner1}));
    });

    it('test access control', async function() {
        const [SMRToken, LCManager, SMREToken] = await instantiate();

        await SMREToken.mint(role.early_investor, SMRE(10), {from: role.owner1});
        for (const _from of [role.nobody, role.sale, role.early_investor, role.dev_fund, role.investor])
            await expectThrow(SMREToken.mint(role.early_investor, SMRE(10), {from: _from}));

        await LCManager.mint(role.investor, SMR(1200), {from: role.sale});
        for (const _from of [role.nobody, role.owner1, role.early_investor, role.dev_fund, role.investor])
            await expectThrow(LCManager.mint(role.investor, SMR(1200), {from: _from}));

        await SMREToken.mint(role.dev_fund, SMRE(40), {from: role.owner1});

        // detach
        for (const _from of [role.nobody, role.owner1, role.early_investor, role.dev_fund, role.investor])
            await expectThrow(LCManager.detach({from: _from}));

        await LCManager.detach({from: role.sale});

        for (const _from of [role.nobody, role.owner1, role.early_investor, role.dev_fund, role.investor])
            await expectThrow(LCManager.detach({from: _from}));

        // end of public sales
        for (const _from of [role.nobody, role.sale, role.early_investor, role.dev_fund, role.investor])
            await expectThrow(LCManager.setSalesFinished({from: _from}));

        await LCManager.setSalesFinished({from: role.owner1});

        // claim SMR
        for (const _from of [role.nobody, role.owner1, role.sale, role.investor])
            await expectThrow(SMREToken.claimSMR({from: _from}));

        await SMREToken.claimSMRforAll(100, {from: role.nobody});
    });

    it('test claiming SMR', async function() {
        const [SMRToken, LCManager, SMREToken] = await instantiate();

        await SMREToken.mint(role.early_investor2, SMRE(2), {from: role.owner1});
        await SMREToken.mint(role.early_investor, SMRE(8), {from: role.owner1});
        await SMREToken.mint(role.investor, SMRE(5), {from: role.owner1});
        await SMREToken.mint(role.investor2, SMRE(5), {from: role.owner1});

        await LCManager.mint(role.investor, SMR(1000), {from: role.sale});

        await SMREToken.mint(role.dev_fund, SMRE(30), {from: role.owner1});

        // end of public sales
        await LCManager.detach({from: role.sale});
        await LCManager.setSalesFinished({from: role.owner1});

        // [early_investor2: not claimed, early_investor: not claimed, investor: not claimed, investor2: not claimed, dev_fund: not claimed]
        assertBigNumberEqual(await SMRToken.balanceOf(role.early_investor2), SMR(0));
        assertBigNumberEqual(await SMRToken.balanceOf(role.early_investor), SMR(0));
        assertBigNumberEqual(await SMRToken.balanceOf(role.investor), SMR(1000));
        assertBigNumberEqual(await SMRToken.balanceOf(role.investor2), SMR(0));
        assertBigNumberEqual(await SMRToken.balanceOf(role.dev_fund), SMR(0));
        assertBigNumberEqual(await SMRToken.totalSupply(), SMR(1000));

        await SMREToken.claimSMR({from: role.early_investor});
        // [early_investor2: not claimed, early_investor: claimed, investor: not claimed, investor2: not claimed, dev_fund: not claimed]
        assertBigNumberEqual(await SMRToken.balanceOf(role.early_investor2), SMR(0));
        assertBigNumberEqual(await SMRToken.balanceOf(role.early_investor), SMR(160));
        assertBigNumberEqual(await SMRToken.balanceOf(role.investor), SMR(1000));
        assertBigNumberEqual(await SMRToken.balanceOf(role.investor2), SMR(0));
        assertBigNumberEqual(await SMRToken.balanceOf(role.dev_fund), SMR(0));
        assertBigNumberEqual(await SMRToken.totalSupply(), SMR(1160));

        await SMREToken.claimSMRforAll(2, {from: role.nobody});
        // [early_investor2: claimed, early_investor: claimed, investor: not claimed, investor2: not claimed, dev_fund: not claimed]
        assertBigNumberEqual(await SMRToken.balanceOf(role.early_investor2), SMR(40));
        assertBigNumberEqual(await SMRToken.balanceOf(role.early_investor), SMR(160));
        assertBigNumberEqual(await SMRToken.balanceOf(role.investor), SMR(1000));
        assertBigNumberEqual(await SMRToken.balanceOf(role.investor2), SMR(0));
        assertBigNumberEqual(await SMRToken.balanceOf(role.dev_fund), SMR(0));
        assertBigNumberEqual(await SMRToken.totalSupply(), SMR(1200));

        await SMREToken.claimSMR({from: role.investor});
        // [early_investor2: claimed, early_investor: claimed, investor: claimed, investor2: not claimed, dev_fund: not claimed]
        assertBigNumberEqual(await SMRToken.balanceOf(role.early_investor2), SMR(40));
        assertBigNumberEqual(await SMRToken.balanceOf(role.early_investor), SMR(160));
        assertBigNumberEqual(await SMRToken.balanceOf(role.investor), SMR(1100));
        assertBigNumberEqual(await SMRToken.balanceOf(role.investor2), SMR(0));
        assertBigNumberEqual(await SMRToken.balanceOf(role.dev_fund), SMR(0));
        assertBigNumberEqual(await SMRToken.totalSupply(), SMR(1300));

        await SMREToken.claimSMRforAll(4, {from: role.nobody});
        // [early_investor2: claimed, early_investor: claimed, investor: claimed, investor2: claimed, dev_fund: claimed]
        assertBigNumberEqual(await SMRToken.balanceOf(role.early_investor2), SMR(40));
        assertBigNumberEqual(await SMRToken.balanceOf(role.early_investor), SMR(160));
        assertBigNumberEqual(await SMRToken.balanceOf(role.investor), SMR(1100));
        assertBigNumberEqual(await SMRToken.balanceOf(role.investor2), SMR(100));
        assertBigNumberEqual(await SMRToken.balanceOf(role.dev_fund), SMR(600));
        assertBigNumberEqual(await SMRToken.totalSupply(), SMR(2000));
    });
});
