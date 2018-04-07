// Based on https://github.com/Neufund/ico-contracts/blob/master/test/helpers/evmCommands.js
// The license is:

// # The MIT License (MIT)
//
// Copyright © 2017 Neufund
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
//
// The software is provided “as is”, without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose and noninfringement. In no event shall the authors or copyright holders be liable for any claim, damages or other liability, whether in an action of contract, tort or otherwise, arising from, out of or in connection with the software or the use or other dealings in the software.


const promisify = func => async (...args) =>
  new Promise((accept, reject) =>
    func(...args, (error, result) => (error ? reject(error) : accept(result)))
  );

export const rpcCommand = method => async (...params) =>
  (await promisify(web3.currentProvider.sendAsync)({
    jsonrpc: "2.0",
    method,
    params,
    id: Date.now()
  })).result;

export const evm_mine = rpcCommand("evm_mine");
export const evm_increaseTime = rpcCommand("evm_increaseTime");
export const evm_snapshot = rpcCommand("evm_snapshot");
export const evm_revert = rpcCommand("evm_revert");

export async function withRollback(func) {
    const snapshotId = await evm_snapshot();
    await func();
    await evm_revert(snapshotId);
}
