import { expect, assert } from 'chai'
import path from 'path'

import { Framework } from '@vechain/connex-framework'
import { Driver, SimpleNet, SimpleWallet } from '@vechain/connex-driver'

import { soloAccounts } from 'myvetools/dist/builtin'
import { compileContract, randBytes } from 'myvetools/dist/utils'
import { Contract } from 'myvetools/dist/contract'
import { getReceipt } from 'myvetools/dist/connexUtils'

describe('Test contract TestNFT721', () => {
	const wallet = new SimpleWallet()
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

	const owner = wallet.list[0].address

	const c = new Contract({
		abi: JSON.parse(compileContract(
			path.resolve(process.cwd(), './contracts/nft-721.sol'),
			'TestNFT721', 'abi')),
		bytecode: compileContract(
			path.resolve(process.cwd(), './contracts/nft-721.sol'),
			'TestNFT721', 'bytecode')
	})

	it('deploy', async () => {
		const clause = c.deploy(0)
		txResp = await connex.vendor.sign('tx', [clause]).signer(owner).request()
		receipt = await getReceipt(connex, 5, txResp.txid)
		expect(receipt.reverted).to.eql(false)

		if (receipt.outputs[0].contractAddress) {
			c.at(receipt.outputs[0].contractAddress)
		}

		c.connex(connex)

		callOut = await c.call('symbol')
		expect(callOut.decoded['0']).to.eql("T721")
	})

	it('approve & transferFrom', async () => {
		const from = wallet.list[1].address
		const to = wallet.list[2].address
		const by = wallet.list[3].address
		const tokenId = randBytes(32)

		txResp = await connex.vendor.sign(
			'tx', [c.send('mint', 0, from, tokenId)]).signer(owner).request()
		receipt = await getReceipt(connex, 5, txResp.txid)
		expect(receipt.reverted).to.eql(false)

		txResp = await connex.vendor.sign(
			'tx', [c.send('approve', 0, by, tokenId)]).signer(from).request()
		receipt = await getReceipt(connex, 5, txResp.txid)
		expect(receipt.reverted).to.eql(false)

		txResp = await connex.vendor.sign(
			'tx', [c.send('safeTransferFrom', 0, from, to, tokenId)]).signer(by).request()
		receipt = await getReceipt(connex, 5, txResp.txid)
		expect(receipt.reverted).to.eql(false)

		callOut = await c.call('ownerOf', tokenId)
		expect(callOut.decoded['0']).to.eql(to)
	})
})