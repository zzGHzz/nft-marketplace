// contracts/settlement.sol
// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

abstract contract Settlement {
	/**
	 * @dev Settle the trading of VIP-181/ERC-721 tokens
	 * @param seller [address]
	 * @param buyer [address]
	 * @param ftAddr [address] FT contract address
	 * @param value [uint256] trade value
	 * @param nftAddr [address] NFT contract address
	 * @param id [uint256] NFT token ID
	 * @return [bool] Success or reverted
	 */
	function settle(
		address seller, address buyer,
		address ftAddr, uint256 value,
		address nftAddr, uint256 id
	) public virtual returns (bool);

	/**
	 * @dev Settle the trading of VIP-210/ERC-1155 tokens
	 * @param seller [address]
	 * @param buyer [address]
	 * @param ftAddr [address] FT contract address
	 * @param value [uint256] trade value
	 * @param nftAddr [address] NFT contract address
	 * @param id [uint256] NFT token ID
	 * @param amount [uint256] NFT token amount
	 * @return [bool] Success or reverted
	 */
	function settle(
		address seller, address buyer,
		address ftAddr, uint256 value,
		address nftAddr, uint256 id, uint256 amount
	) public virtual returns (bool);
}