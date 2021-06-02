import { expect, assert } from 'chai'
import path from 'path'

import { Framework } from '@vechain/connex-framework'
import { Driver, SimpleNet, SimpleWallet } from '@vechain/connex-driver'

import { soloAccounts } from 'myvetools/dist/builtin'
import { compileContract, getABI } from 'myvetools/dist/utils'
import { Contract } from 'myvetools/dist/contract'
import { getReceipt, decodeEvent } from 'myvetools/dist/connexUtils'

describe('Test contract TestNFT721', () => {
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
			path.resolve(process.cwd(), './contracts/nft-721.sol'),
			'TestNFT721', 'abi')),
		bytecode: compileContract(
			path.resolve(process.cwd(), './contracts/nft-721.sol'),
			'TestNFT721', 'bytecode')
	})

	it('deploy', async () => {
		const owner = wallet.list[0].address

		const clause = c.deploy(0)
		txRep = await connex.vendor.sign('tx', [clause])
			.signer(owner)
			.request()
		receipt = await getReceipt(connex, 5, txRep.txid)
		expect(receipt.reverted).to.eql(false)

		if (receipt.outputs[0].contractAddress) {
			c.at(receipt.outputs[0].contractAddress)
		}

		c.connex(connex)

		callOut = await c.call('symbol')
		expect(callOut.decoded['0']).to.eql("T721")
	})

	it('mint', async () => {
		const minter = wallet.list[0].address
		const to = wallet.list[1].address
		const tokenID = 123456789

		const clause = c.send(
			'mint', 0,
			to,
			tokenID
		)

		txRep = await connex.vendor.sign('tx', [clause])
			.signer(minter)
			.request()
		receipt = await getReceipt(connex, 5, txRep.txid)
		expect(receipt.reverted).to.eql(false)

		const decoded = decodeEvent(receipt.outputs[0].events[0], c.ABI('Transfer', 'event'))
		expect(decoded['from']).to.eql('0x' + '0'.repeat(40))
		expect(decoded['to']).to.eql(to)
		expect(parseInt(decoded['tokenId'])).to.eql(tokenID)

		callOut = await c.call(
			'ownerOf',
			tokenID
		)
		expect(callOut.decoded['0']).to.eql(to)
	})

	it('transfer', async () => {
		const from = wallet.list[1].address
		const to = wallet.list[2].address
		const tokenID = 123456789

		const clause = c.send(
			'safeTransferFrom', 0,
			from,
			to,
			tokenID
		)

		txRep = await connex.vendor.sign('tx', [clause])
			.signer(from)
			.request()
		receipt = await getReceipt(connex, 5, txRep.txid)
		expect(receipt.reverted).to.eql(false)

		// Two events emitted: 
		// event Approve - clear approval from the previous owner
		// event Transfer - transfer of the token  
		const decoded = decodeEvent(receipt.outputs[0].events[1], c.ABI('Transfer', 'event'))
		expect(decoded['from']).to.eql(from)
		expect(decoded['to']).to.eql(to)
		expect(parseInt(decoded['tokenId'])).to.eql(tokenID)
	})
})