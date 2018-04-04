# smartz-sale

[![Build Status](https://api.travis-ci.org/mixbytes/smartz-sale.svg?branch=master)](https://travis-ci.com/mixbytes/smartz-sale)

[Smartz](https://smartz.io) token & sale contracts.

Install dependencies:
```bash
npm install
```

Build and test:
```bash
# make sure ganache is running:
./node_modules/.bin/ganache-cli -l 10000000 &>/tmp/ganache.log &

./node_modules/.bin/truffle compile && ./node_modules/.bin/truffle test
```
