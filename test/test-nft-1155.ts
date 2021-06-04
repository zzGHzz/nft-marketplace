import { expect, assert } from 'chai'
import path from 'path'

import { Framework } from '@vechain/connex-framework'
import { Driver, SimpleNet, SimpleWallet } from '@vechain/connex-driver'

import { soloAccounts } from 'myvetools/dist/builtin'
import { compileContract, getABI } from 'myvetools/dist/utils'
import { Contract } from 'myvetools/dist/contract'
import { getReceipt, decodeEvent } from 'myvetools/dist/connexUtils'

describe('Test contract TestNFT1155', () => {
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
	let txResp: Connex.Vendor.TxResponse
	let callOut: Connex.VM.Output & Connex.Thor.Account.WithDecoded

	const c = new Contract({
		abi: JSON.parse(compileContract(
			path.resolve(process.cwd(), './contracts/nft-1155.sol'),
			'TestNFT1155', 'abi')),
		bytecode: compileContract(
			path.resolve(process.cwd(), './contracts/nft-1155.sol'),
			'TestNFT1155', 'bytecode')
	})

	it('deploy', async () => {
		const uri = 'https://test_uri'
		const clause = c.deploy(0, uri)
		txResp = await connex.vendor.sign('tx', [clause])
			.signer(wallet.list[0].address)
			.request()
		receipt = await getReceipt(connex, 5, txResp.txid)
		expect(receipt.reverted).to.eql(false)

		if (receipt.outputs[0].contractAddress) {
			c.at(receipt.outputs[0].contractAddress)
		}

		c.connex(connex)

		callOut = await c.call('uri', 0)
		expect(callOut.decoded['0']).to.eql(uri)
	})

	it('mint', async () => {
		const tokenID = 0

		const clause = c.send(
			'mint', 0,
			wallet.list[1].address,
			tokenID, 100, []
		)
		txResp = await connex.vendor.sign('tx', [clause])
			.signer(wallet.list[0].address)
			.request()
		receipt = await getReceipt(connex, 5, txResp.txid)
		expect(receipt.reverted).to.eql(false)

		callOut = await c.call(
			'balanceOf',
			wallet.list[1].address, tokenID
		)
		expect(parseInt(callOut.decoded['0'])).to.eql(100)
	})

	it('transfer', async () => {
		const tokenID = 0

		const clause = c.send(
			'safeTransferFrom', 0,
			wallet.list[1].address,
			wallet.list[2].address,
			tokenID,
			20, []
		)
		txResp = await connex.vendor.sign('tx', [clause])
			.signer(wallet.list[1].address)
			.request()
		receipt = await getReceipt(connex, 5, txResp.txid)
		expect(receipt.reverted).to.eql(false)

		callOut = await c.call(
			'balanceOf',
			wallet.list[1].address, tokenID
		)
		expect(parseInt(callOut.decoded['0'])).to.eql(80)

		callOut = await c.call(
			'balanceOf',
			wallet.list[2].address, tokenID
		)
		expect(parseInt(callOut.decoded['0'])).to.eql(20)
	})
})