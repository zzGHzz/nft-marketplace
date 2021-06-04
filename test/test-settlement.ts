import { expect, assert } from 'chai'
import path from 'path'
import BN from 'bn.js'

import { Framework } from '@vechain/connex-framework'
import { Driver, SimpleNet, SimpleWallet } from '@vechain/connex-driver'

import { soloAccounts } from 'myvetools/dist/builtin'
import { compileContract, numToHexStr, randBytes } from 'myvetools/dist/utils'
import { Contract } from 'myvetools/dist/contract'
import { getReceipt, decodeEvent } from 'myvetools/dist/connexUtils'
import { batchSend, getErr } from './utils'

describe('Test contract Settlement', () => {
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
	let dryRunOut: Connex.VM.Output[]

	enum Cont {
		Settlement,
		ProfitSharing,
		ERC20,
		ERC721,
		ERC1155
	}

	let contracts: Contract[] = []
	let contractAddrs: string[] = []
	const fileNames = ['settlement', 'profit-sharing', 'ft', 'nft-721', 'nft-1155']
	const contractNames = ['Settlement', 'ProfitSharing', 'TestToken', 'TestNFT721', 'TestNFT1155']

	fileNames.forEach((name, i) => {
		contracts.push(new Contract({
			abi: JSON.parse(compileContract(
				path.resolve(process.cwd(), './contracts/' + name + '.sol'),
				contractNames[i], 'abi')),
			bytecode: compileContract(
				path.resolve(process.cwd(), './contracts/' + name + '.sol'),
				contractNames[i], 'bytecode')
		}))
	})

	const owner = wallet.list[0].address

	it('deploy', async () => {
		contracts.forEach(c => {
			c.connex(connex)
		})

		const erc20Supply = 40000

		// Deploy contracts
		let clauses: Connex.VM.Clause[] = []
		clauses.push(contracts[Cont.Settlement].deploy(0))
		clauses.push(contracts[Cont.ProfitSharing].deploy(0))
		clauses.push(contracts[Cont.ERC20].deploy(0, erc20Supply))
		clauses.push(contracts[Cont.ERC721].deploy(0))
		clauses.push(contracts[Cont.ERC1155].deploy(0, 'https://test_uri'))

		let txResps: Connex.Vendor.TxResponse[] = []
		for (let clause of clauses) {
			txResps.push(await connex.vendor.sign('tx', [clause]).signer(owner).request())
		}

		for (let i = 0; i < txResps.length; i++) {
			receipt = await getReceipt(connex, 5, txResps[i].txid)
			expect(receipt.reverted).to.eql(false)

			// Get the deployed contract addresses
			if (receipt.outputs[0].contractAddress !== null) {
				contractAddrs.push(receipt.outputs[0].contractAddress)
			} else {
				assert.fail('Contract ' + Cont[i] + ' address not found')
			}
		}

		// Set contract address
		contractAddrs.forEach((addr, i) => { contracts[i].at(addr) })
	})

	it('Test modifier', async () => {
		const zeroAddr = '0x' + '0'.repeat(40)
		let clauses: Connex.VM.Clause[] = []
		const c = contracts[Cont.Settlement]

		const errMsgs = [
			'Not owner',
			'Invalid seller address',
			'Invalid buyer address',
			'Buyer and seller cannot be the same address',
			'Invalid FT contract address',
			'Invalid NFT contract address'
		]

		// not owner
		clauses.push(c.send('settle', 0,
			randBytes(20), randBytes(20), randBytes(20), 1, randBytes(20), randBytes(32), [], randBytes(20)))
		// seller == 0
		clauses.push(c.send('settle', 0,
			zeroAddr, randBytes(20), randBytes(20), 1, randBytes(20), randBytes(32), [], randBytes(20)))
		// buyer == 0
		clauses.push(c.send('settle', 0,
			randBytes(20), zeroAddr, randBytes(20), 1, randBytes(20), randBytes(32), [], randBytes(20)))
		// seller == buyer
		const seller = randBytes(20)
		clauses.push(c.send('settle', 0,
			seller, seller, randBytes(20), 1, randBytes(20), randBytes(32), [], randBytes(20)))
		// ftAddr == 0
		clauses.push(c.send('settle', 0,
			randBytes(20), randBytes(20), zeroAddr, 1, randBytes(20), randBytes(32), [], randBytes(20)))
		// nftAddr == 0
		clauses.push(c.send('settle', 0,
			randBytes(20), randBytes(20), randBytes(20), 1, zeroAddr, randBytes(32), [], randBytes(20)))

		dryRunOut = await connex.thor.explain(clauses).caller(randBytes(20)).execute()

		dryRunOut.forEach((out, i) => {
			expect(out.reverted).to.eql(true)
			expect(out.revertReason).to.eql(errMsgs[i])
		})
	})

	it('Trade 721 token without profit sharing', async () => {
		const seller = wallet.list[1].address
		const buyer = wallet.list[2].address

		const tokenId = randBytes(32)
		const value = new BN(10).pow(new BN(18 + 4))

		// mint NFT token and transfer FT fund
		txResp = await connex.vendor.sign('tx', [
			contracts[Cont.ERC721].send('mint', 0, seller, tokenId),
			contracts[Cont.ERC20].send('transfer', 0, buyer, hex(value))
		]).signer(owner).request()
		receipt = await getReceipt(connex, 5, txResp.txid)
		expect(receipt.reverted).to.eql(false)

		const receipts = await batchSend(
			connex,
			[
				[contracts[Cont.ERC20].send('approve', 0, contractAddrs[Cont.Settlement], hex(value))],
				[contracts[Cont.ERC721].send('approve', 0, contractAddrs[Cont.Settlement], tokenId)]
			],
			[buyer, seller]
		)
		receipts.forEach(r => { expect(r.reverted).to.eql(false) })

		// Settle trade
		const clause = contracts[Cont.Settlement].send(
			'settle', 0,
			seller, buyer,
			contractAddrs[Cont.ERC20], hex(value),
			contractAddrs[Cont.ERC721], tokenId, [],
			contractAddrs[Cont.ProfitSharing]
		)
		txResp = await connex.vendor.sign('tx', [clause]).signer(owner).request()
		receipt = await getReceipt(connex, 5, txResp.txid)
		expect(receipt.reverted).to.eql(false)

		callOut = await contracts[Cont.ERC20].call('balanceOf', seller)
		expect(callOut.decoded['0']).to.eql(value.toString(10))
		callOut = await contracts[Cont.ERC721].call('ownerOf', tokenId)
		expect(callOut.decoded['0']).to.eql(buyer)
	})

	it('Trade 721 token with profit sharing', async () => {
		const tokenId = randBytes(32)
		const value = new BN(10).pow(new BN(18 + 4))

		const seller = wallet.list[3].address
		const buyer = wallet.list[4].address
		const beneficiary = [randBytes(20), randBytes(20), randBytes(20)]
		const pct = [50000, 24000, 16000]

		let shared: string[] = []
		let transferred = new BN(value)
		pct.forEach(p => {
			const v = new BN(p, 10).mul(value).div(new BN(10000 * 100, 10))
			transferred = transferred.sub(v)
			shared.push(v.toString(10))
		})

		// mint NFT token and transfer FT fund
		txResp = await connex.vendor.sign(
			'tx', [
			contracts[Cont.ERC721].send('mint', 0, seller, tokenId),
			contracts[Cont.ProfitSharing].send(
				'addOrUpdate', 0, contractAddrs[Cont.ERC721], tokenId, beneficiary, pct),
			contracts[Cont.ERC20].send('transfer', 0, buyer, hex(value))
		],
		).signer(owner).request()
		receipt = await getReceipt(connex, 5, txResp.txid)
		expect(receipt.reverted).to.eql(false)

		callOut = await contracts[Cont.ProfitSharing].call(
			'cal', hex(value), contractAddrs[Cont.ERC721], tokenId)
		expect(callOut.decoded['0'].length).to.eql(beneficiary.length)
		expect(callOut.decoded['1'].length).to.eql(beneficiary.length)
		for (let i = 0; i < beneficiary.length; i++) {
			expect(callOut.decoded['0'][i]).to.eql(beneficiary[i])
			expect(callOut.decoded['1'][i]).to.eql('' + shared[i])
		}

		const receipts = await batchSend(
			connex,
			[
				[contracts[Cont.ERC20].send('approve', 0, contractAddrs[Cont.Settlement], hex(value))],
				[contracts[Cont.ERC721].send('approve', 0, contractAddrs[Cont.Settlement], tokenId)]
			],
			[buyer, seller]
		)
		receipts.forEach(r => { expect(r.reverted).to.eql(false) })

		// Settle trade
		const clause = contracts[Cont.Settlement].send(
			'settle', 0,
			seller, buyer,
			contractAddrs[Cont.ERC20], hex(value),
			contractAddrs[Cont.ERC721], tokenId, [],
			contractAddrs[Cont.ProfitSharing]
		)
		txResp = await connex.vendor.sign('tx', [clause]).signer(owner).request()
		receipt = await getReceipt(connex, 5, txResp.txid)
		expect(receipt.reverted).to.eql(false)

		callOut = await contracts[Cont.ERC721].call('ownerOf', tokenId)
		expect(callOut.decoded['0']).to.eql(buyer)

		callOut = await contracts[Cont.ERC20].call('balanceOf', seller)
		expect(callOut.decoded['0']).to.eql('' + transferred)

		for (let i = 0; i < beneficiary.length; i++) {
			callOut = await contracts[Cont.ERC20].call('balanceOf', beneficiary[i])
			expect(callOut.decoded['0']).to.eql(shared[i])
		}
	})

	it('Trade 1155 token without profit sharing', async () => {
		const seller = wallet.list[5].address
		const buyer = wallet.list[6].address

		const tokenId = randBytes(32)
		const amount = 1000
		const transferredAmount = 19
		const value = new BN(10).pow(new BN(18 + 4))

		// mint NFT token and transfer FT fund
		txResp = await connex.vendor.sign('tx', [
			contracts[Cont.ERC1155].send('mint', 0, seller, tokenId, amount, []),
			contracts[Cont.ERC20].send('transfer', 0, buyer, hex(value))
		]).signer(owner).request()
		receipt = await getReceipt(connex, 5, txResp.txid)
		expect(receipt.reverted).to.eql(false)

		const receipts = await batchSend(
			connex,
			[
				[contracts[Cont.ERC20].send('approve', 0, contractAddrs[Cont.Settlement], hex(value))],
				[contracts[Cont.ERC1155].send('setApprovalForAll', 0, contractAddrs[Cont.Settlement], true)]
			],
			[buyer, seller]
		)
		receipts.forEach(r => { expect(r.reverted).to.eql(false) })

		// Settle trade
		const clause = contracts[Cont.Settlement].send(
			'settle', 0,
			seller, buyer,
			contractAddrs[Cont.ERC20], hex(value),
			contractAddrs[Cont.ERC1155], tokenId, transferredAmount, [],
			contractAddrs[Cont.ProfitSharing]
		)
		txResp = await connex.vendor.sign('tx', [clause]).signer(owner).request()
		receipt = await getReceipt(connex, 5, txResp.txid)
		expect(receipt.reverted).to.eql(false)

		// Check ERC20 balance
		callOut = await contracts[Cont.ERC20].call('balanceOf', seller)
		expect(callOut.decoded['0']).to.eql(value.toString(10))

		// Check ERC1155 balances
		callOut = await contracts[Cont.ERC1155].call('balanceOf', buyer, tokenId)
		expect(callOut.decoded['0']).to.eql('' + transferredAmount)
		callOut = await contracts[Cont.ERC1155].call('balanceOf', seller, tokenId)
		expect(callOut.decoded['0']).to.eql('' + (amount - transferredAmount))
	})

	it('Trade 1155 token with profit sharing', async () => {
		const tokenId = randBytes(32)
		const amount = 1000
		const transferredAmount = 19
		const value = new BN(10).pow(new BN(18 + 4))

		const seller = wallet.list[7].address
		const buyer = wallet.list[8].address
		const beneficiary = [randBytes(20), randBytes(20), randBytes(20)]
		const pct = [50000, 24000, 16000]

		let shared: string[] = []
		let transferred = new BN(value)
		pct.forEach(p => {
			const v = new BN(p, 10).mul(value).div(new BN(10000 * 100, 10))
			transferred = transferred.sub(v)
			shared.push(v.toString(10))
		})

		// mint NFT token and transfer FT fund
		txResp = await connex.vendor.sign(
			'tx', [
			contracts[Cont.ERC1155].send('mint', 0, seller, tokenId, amount, []),
			contracts[Cont.ProfitSharing].send(
				'addOrUpdate', 0, contractAddrs[Cont.ERC1155], tokenId, beneficiary, pct),
			contracts[Cont.ERC20].send('transfer', 0, buyer, hex(value))
		],
		).signer(owner).request()
		receipt = await getReceipt(connex, 5, txResp.txid)
		expect(receipt.reverted).to.eql(false)

		callOut = await contracts[Cont.ProfitSharing].call(
			'cal', hex(value), contractAddrs[Cont.ERC1155], tokenId)
		expect(callOut.decoded['0'].length).to.eql(beneficiary.length)
		expect(callOut.decoded['1'].length).to.eql(beneficiary.length)
		for (let i = 0; i < beneficiary.length; i++) {
			expect(callOut.decoded['0'][i]).to.eql(beneficiary[i])
			expect(callOut.decoded['1'][i]).to.eql('' + shared[i])
		}

		const receipts = await batchSend(
			connex,
			[
				[contracts[Cont.ERC20].send('approve', 0, contractAddrs[Cont.Settlement], hex(value))],
				[contracts[Cont.ERC1155].send('setApprovalForAll', 0, contractAddrs[Cont.Settlement], true)]
			],
			[buyer, seller]
		)
		receipts.forEach(r => { expect(r.reverted).to.eql(false) })

		// Settle trade
		const clause = contracts[Cont.Settlement].send(
			'settle', 0,
			seller, buyer,
			contractAddrs[Cont.ERC20], hex(value),
			contractAddrs[Cont.ERC1155], tokenId, transferredAmount, [],
			contractAddrs[Cont.ProfitSharing]
		)
		txResp = await connex.vendor.sign('tx', [clause]).signer(owner).request()
		receipt = await getReceipt(connex, 5, txResp.txid)
		expect(receipt.reverted).to.eql(false)

		// Check ERC1155 balances
		callOut = await contracts[Cont.ERC1155].call('balanceOf', buyer, tokenId)
		expect(callOut.decoded['0']).to.eql('' + transferredAmount)
		callOut = await contracts[Cont.ERC1155].call('balanceOf', seller, tokenId)
		expect(callOut.decoded['0']).to.eql('' + (amount - transferredAmount))

		// Check ERC20 balances
		callOut = await contracts[Cont.ERC20].call('balanceOf', seller)
		expect(callOut.decoded['0']).to.eql('' + transferred)
		for (let i = 0; i < beneficiary.length; i++) {
			callOut = await contracts[Cont.ERC20].call('balanceOf', beneficiary[i])
			expect(callOut.decoded['0']).to.eql(shared[i])
		}
	})
})

function hex(x: BN): string {
	return '0x' + x.toString('hex')
}