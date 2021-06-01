// contracts/profit-sharing.sol
// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

abstract contract ProfitSharing {
	event AddOrUpdate(address indexed nftAddr, uint256 indexed id, address[] benefiary, uint256[] pct);

	/**
	 * @dev Add or update profit sharing rules for NFT tokens
	 * @param seller [address] 
	 * @param buyer [address]
	 * @param nftAddr [address] NFT contract address
	 * @param id [uint256] NFT token ID
	 * @param benefiary [addresss[]]
	 * @param pct [uint256[] decimal = 4] Percentages of each trading amount going to the benefiaries. 
	 * @return [bool] Success or reverted
	 */
	function addOrUpdate(
		address seller, address buyer, 
		address nftAddr, uint256 id,
		address[] memory benefiary, uint256[] memory pct
	) public virtual returns (bool);

	/**
	 * @dev Calculate the shared amount according the stored rule
	 * @param value [uint256] Trading amount
	 * @param nftAddr [address] NFT contract address
	 * @param id [uint256] NFT token ID
	 * @return [address[]] Benefiaries
	 * @return [uint256[]] Amount to be shared
	 */
	function cal(
		uint256 value, address nftAddr, uint256 id
	) public virtual view returns (address[] memory, uint256[] memory);
}