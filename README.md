# smartz-sale

![](https://travis-ci.org/mixbytes/smartz-sale.svg?branch=master)

[Smartz](https://smartz.io) token & sale contracts.

Install dependencies:
```bash
npm install
```

Build and test:
```bash
# make sure ganache is running:
./node_modules/.bin/ganache-cli -u 0 -u 1 -u 2 -u 3 -u 4 -u 5 --gasPrice 2000 &

./node_modules/.bin/truffle compile && ./node_modules/.bin/truffle test
```
