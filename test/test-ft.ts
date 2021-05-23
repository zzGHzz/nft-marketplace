import { expect, assert } from 'chai'
import path from 'path'

import { Framework } from '@vechain/connex-framework'
import { Driver, SimpleNet, SimpleWallet } from '@vechain/connex-driver'

import { soloAccounts } from 'myvetools/dist/builtin'
import { compileContract } from 'myvetools/dist/utils'
import { Contract } from 'myvetools/dist/contract'
import { getReceipt } from 'myvetools/dist/connexUtils'
import { numToHexStr } from 'myvetools/dist/utils'

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

	let receipt: Connex.Thor.Transaction.Receipt
	let txRep: Connex.Vendor.TxResponse
	let callOut: Connex.VM.Output & Connex.Thor.Account.WithDecoded

	const c = new Contract({
		abi: JSON.parse(compileContract(
			path.resolve(process.cwd(), './contracts/ft.sol'),
			'TestToken', 'abi')),
		bytecode: compileContract(
			path.resolve(process.cwd(), './contracts/ft.sol'),
			'TestToken', 'bytecode')
	})

	it('deploy', async () => {
		const clause = c.deploy(0)
		txRep = await connex.vendor.sign('tx', [clause]).signer(wallet.list[0].address).request()
		receipt = await getReceipt(connex, 5, txRep.txid)
		expect(receipt.reverted).to.eql(false)
		if (receipt.outputs[0].contractAddress) {
			c.at(receipt.outputs[0].contractAddress)
		}

		c.connex(connex)
		callOut = await c.call('symbol')
		expect(callOut.decoded['0']).to.eql('TT')

		callOut = await c.call('balanceOf', wallet.list[0].address)
		expect(callOut.decoded['0']).to.eql('1' + '0'.repeat(18 + 4))
	})

	it('transfer', async () => {
		const clause = c.send(
			'transfer', 
			0, 
			wallet.list[1].address, 
			numToHexStr(100 * 10 ** 18)
		)
		txRep = await connex.vendor.sign('tx', [clause])
			.signer(wallet.list[0].address)
			.request()
		receipt = await getReceipt(connex, 5, txRep.txid)
		expect(receipt.reverted).to.eql(false)

		callOut = await c.call('balanceOf', wallet.list[1].address)
		expect(callOut.decoded['0']).to.eql('1' + '0'.repeat(2 + 18))
	})
})

/**
 * 	// Initiate a Contract instance
 * 	const abi = JSON.parse(compileContract('path/to/file', 'contract-name', 'abi'))
 * 	const bin = compileContract('path/to/file', 'contract-name', 'bytecode')
 * 	const c = new Contract({abi: abi, bytecode: bin, connex: connex})
 *
 * 	// construct a clause for contract deployment
 * 	const clause = c.deploy(value, ...params)
 *
 * 	// Send a transaction
 * 	txRep = await connex.vendor.sign('tx', [clause1, clause2, ...])
 * 			.signer(sender)
 * 			.request()
 *
 * 	// Get receipt and check success of the tx execution
 * 	receipt = await getReceipt(connex, timeoutInBlock, txRep.txid)
 * 	expect(receipt.reverted).to.equal(false)
 *
 * 	// Get the contract address and set it to the contract instance
 * 	if (receipt.outputs[0].contractAddress !== null) {
 * 		c.at(receipt.outputs[0].contractAddress)
 * 	}
 *
 *  // Get event info
 * 	const decoded = decodeEvent(
 * 		receipt.outputs[clauseIndex].events[eventIndex],
 * 		getABI(abi, 'EventName', 'event')
 * 	)
 *
 * 	// Call contract function locally
 *  callOut = await c.call('funcName', ...params)
 */