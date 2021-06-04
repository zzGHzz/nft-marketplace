import { expect, assert } from 'chai'
import path from 'path'
import crypto from 'crypto'

import { Framework } from '@vechain/connex-framework'
import { Driver, SimpleNet, SimpleWallet } from '@vechain/connex-driver'

import { soloAccounts } from 'myvetools/dist/builtin'
import { compileContract, getABI, lPadHex } from 'myvetools/dist/utils'
import { Contract } from 'myvetools/dist/contract'
import { getReceipt, decodeEvent } from 'myvetools/dist/connexUtils'

describe('Test contract ProfitSharing', () => {
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
			path.resolve(process.cwd(), './contracts/profit-sharing.sol'),
			'ProfitSharing', 'abi')),
		bytecode: compileContract(
			path.resolve(process.cwd(), './contracts/profit-sharing.sol'),
			'ProfitSharing', 'bytecode')
	})

	const owner = wallet.list[0].address
	const nftAddr = genRandAddress()
	const id = 123456789
	const beneficiary = [genRandAddress(), genRandAddress(), genRandAddress()]
	const pct = [50000, 24000, 16000]
	const value = 10000
	const zeroAddr = '0x' + '0'.repeat(40)

	it('deploy', async () => {
		c.connex(connex)
		const clause = c.deploy(0)
		txResp = await connex.vendor.sign('tx', [clause])
			.signer(owner)
			.request()
		receipt = await getReceipt(connex, 5, txResp.txid)
		expect(receipt.reverted).to.eql(false)

		if (receipt.outputs[0].contractAddress !== null) {
			c.at(receipt.outputs[0].contractAddress)
		}
	})

	describe('Test addOrUpdate', () => {
		it('requirement check', async () => {
			const txs = [
				[c.send('addOrUpdate', 0, nftAddr, id, beneficiary, pct)],
				[c.send('addOrUpdate', 0, zeroAddr, id, beneficiary, pct)],
				[c.send('addOrUpdate', 0, nftAddr, id, [], pct)],
				[c.send('addOrUpdate', 0, nftAddr, id, beneficiary, pct.slice(1))],
				[c.send('addOrUpdate', 0, nftAddr, id, beneficiary, [10000001, 1, 1])],
				[c.send('addOrUpdate', 0, nftAddr, id, beneficiary, [100000, 0, 1])],
				[c.send('addOrUpdate', 0, nftAddr, id, beneficiary, [500000, 500000, 1])]
			]
			const callers = [wallet.list[1].address, owner, owner, owner, owner, owner, owner]
			const errs = [
				'Account not permitted',
				'Zero NFT contract address',
				'No beneficiary',
				'beneficiary.length != pct.length',
				'Percentage outside of (0, 1)',
				'Percentage outside of (0, 1)',
				'Total percentage larger than 100%'
			]

			for(let i = 0; i<txs.length;i++) {
				const dryRunOut = await connex.thor.explain(txs[i]).caller(callers[i]).execute()
				expect(dryRunOut[0].revertReason).to.eql(errs[i])
			}
		})

		it('add a profit sharing rule', async () => {
			const clause = c.send('addOrUpdate', 0, nftAddr, id, beneficiary, pct)

			txResp = await connex.vendor.sign('tx', [clause])
				.signer(owner)
				.request()
			receipt = await getReceipt(connex, 5, txResp.txid)
			expect(receipt.reverted).to.eql(false)

			const abi = JSON.parse(compileContract(
				path.resolve(process.cwd(), './contracts/profit-sharing.sol'),
				'ProfitSharing', 'abi')
			)
			const decoded = decodeEvent(receipt.outputs[0].events[0], getABI(abi, 'AddOrUpdate', 'event'))
			expect(decoded['nftAddr']).to.eql(nftAddr)
			expect(parseInt(decoded['id'], 10)).to.eql(id)

			for (let i = 0; i < beneficiary.length; i++) {
				expect(decoded['beneficiary'][i]).to.eql(beneficiary[i])
				expect(parseInt(decoded['pct'][i], 10)).to.eql(pct[i])
			}
		})
	})

	describe('Test cal', () => {
		it('zero nftAddr', async () => {
			callOut = await c.call('cal', value, zeroAddr, id)
			expect(callOut.reverted).to.eql(true)
		})
		it('record not existing', async () => {
			callOut = await c.call('cal', value, nftAddr, id - 1)
			expect(callOut.decoded['0'].length).to.eql(0)
		})
		it('check results', async () => {
			callOut = await c.call('cal', value, nftAddr, id)
			for (let i = 0; i < beneficiary.length; i++) {
				expect(callOut.decoded['0'][i]).to.eql(beneficiary[i])
				expect(parseInt(callOut.decoded['1'][i])).to.eql(pct[i] * value / (100 * 1e4))
			}
		})
	})
})

function genRandAddress(): string {
	return lPadHex('0x' + crypto.randomBytes(20).toString('hex'), 40)
}