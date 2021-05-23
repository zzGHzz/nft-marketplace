import { expect, assert } from 'chai'
import path from 'path'

import { Framework } from '@vechain/connex-framework'
import { Driver, SimpleNet, SimpleWallet } from '@vechain/connex-driver'

import { soloAccounts } from 'myvetools/dist/builtin'
import { compileContract } from 'myvetools/dist/utils'
import { Contract } from 'myvetools/dist/contract'

describe('Test TestToken contract', () => {
	const wallet = new SimpleWallet()
	// Add private keys
	soloAccounts.forEach(val => { wallet.import(val) })

	// Set to connect to a local Thor node
	const url = 'http://localhost:8669/'

	let driver: Driver
	let connex: Framework

	before(async () => {
		try {
			driver = await Driver.connect(new SimpleNet(url), wallet)
			connex = new Framework(driver)
		} catch (err) {
			assert.fail('Failed to connect: ' + err)
		}
	})

	after(() => {
		driver.close()
	})

	const abi = JSON.parse(compileContract(path.resolve(process.cwd(), '../contracts/test-token.sol'), 'abi'))
	const bin = JSON.parse(compileContract(path.resolve(process.cwd(), '../contracts/test-token.sol'), 'bytecode'))
	const c = new Contract({ abi: abi, bytecode: bin, connex: connex })

	it('Deploy', async () => {
		try {
			 const clause = c.deploy(0)
			 const txRep = await connex.vendor.sign('tx', [clause]).request()
			 const receipt = await 
		} catch (err) {
			assert.fail('Failed to deploy: ' + err)
		}
	})
})