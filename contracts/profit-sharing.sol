// contracts/profit-sharing.sol
// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract ProfitSharing {
	uint256 private _decimal = 4;

	// Owner of the contract who is allowed to add/update profit sharing rules
    address public owner;
    modifier isOwner {
        require(
            owner != address(0) && msg.sender == owner,
            "Account not permitted"
        );
        _;
    }

    // Benefiaries
    mapping(bytes32 => address[]) private _beneficiary;
    // Percentage of the trading amount to be shared
    mapping(bytes32 => uint256[]) private _pct;

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Add or update profit sharing rules for NFT tokens
     * @param nftAddr [address] NFT contract address
     * @param tokenId [uint256] NFT token ID
     * @param beneficiary [addresss[]]
     * @param pct [uint256[] decimal = 4] Percentages of each trading amount going to the benefiaries.
     * @return [bool] Success or reverted
     */
    function addOrUpdate(
        address nftAddr,
        uint256 tokenId,
        address[] memory beneficiary,
        uint256[] memory pct
    ) public isOwner returns (bool) {
        require(nftAddr != address(0), "Zero NFT contract address");
        require(beneficiary.length > 0, "No beneficiary");
        require(
            beneficiary.length == pct.length,
            "beneficiary.length != pct.length"
        );

        uint256 MAX = 100 * 10**_decimal; // 100%
        uint256 sum = 0;
        for (uint256 i = 0; i < pct.length; i++) {
            require(pct[i] > 0 && pct[i] <= MAX, "Percentage outside of (0, 1)");
            require(beneficiary[i] != address(0), "Zero beneficiary address");
            sum += pct[i];
        }
        require(sum <= MAX, "Total percentage larger than 100%");

        bytes32 index = _index(nftAddr, tokenId);
        _beneficiary[index] = beneficiary;
        _pct[index] = pct;

        emit AddOrUpdate(nftAddr, tokenId, beneficiary, pct);

        return true;
    }

    event AddOrUpdate(
        address indexed nftAddr,
        uint256 indexed id,
        address[] beneficiary,
        uint256[] pct
    );

    /**
     * @dev Calculate the shared amount according the stored rule
     * @param value [uint256] Trading amount
     * @param nftAddr [address] NFT contract address
     * @param tokenId [uint256] NFT token ID
     * @return beneficiary [address[]]
     * @return amount [uint256[]]
     */
    function cal(
        uint256 value,
        address nftAddr,
        uint256 tokenId
    )
        public
        view
        returns (address[] memory beneficiary, uint256[] memory amount)
    {
        require(nftAddr != address(0), "Zero NFT contract address");

        bytes32 index = _index(nftAddr, tokenId);
        beneficiary = _beneficiary[index];

        if (beneficiary.length == 0) {
            return (new address[](0), new uint256[](0));
        }

        amount = new uint256[](beneficiary.length);
        uint256 MAX = 100 * 10**_decimal;
        for (uint256 i = 0; i < beneficiary.length; i++) {
            amount[i] = (value * _pct[index][i]) / MAX;
        }
    }

	function _index(address nftAddr, uint256 tokenId) internal pure returns (bytes32) {
		return sha256(abi.encode(nftAddr, tokenId));
	}

	function decimal() public view returns (uint256) {
		return _decimal;
	}
}
