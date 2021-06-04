// contracts/settlement.sol
// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

interface IProfitSharing {
    function cal(
        uint256 value,
        address nftAddr,
        uint256 id
    )
        external
        view
        returns (address[] memory beneficiary, uint256[] memory amount);
}

contract Settlement {
    address public owner; // only owner can call function settle

    modifier isOwner {
        require(owner != address(0) && msg.sender == owner, "Not owner");
        _;
    }

    modifier checkAddrs(
        address seller,
        address buyer,
        address ftAddr,
        address nftAddr
    ) {
        require(seller != address(0), "Invalid seller address");
        require(buyer != address(0), "Invalid buyer address");
        require(buyer != seller, "Buyer and seller cannot be the same address");
        require(ftAddr != address(0), "Invalid FT contract address");
        require(nftAddr != address(0), "Invalid NFT contract address");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Settle the trading of VIP-181/ERC-721 tokens
     * @param seller [address]
     * @param buyer [address]
     * @param ftAddr [address] FT contract address
     * @param value [uint256] trade value
     * @param nftAddr [address] NFT contract address
     * @param id [uint256] NFT token ID
     * @param data [bytes] Extra data (optional)
     * @param psAddr [address] ProfitSharing contract address
     */
    function settle(
        address seller,
        address buyer,
        address ftAddr,
        uint256 value,
        address nftAddr,
        uint256 id,
        bytes memory data,
        address psAddr
    ) public isOwner checkAddrs(seller, buyer, ftAddr, nftAddr) {
        _transferNFT(seller, buyer, nftAddr, id, 0, data);

        _transferFT(seller, buyer, nftAddr, id, ftAddr, value, psAddr);

        emit Settle(seller, buyer, ftAddr, value, nftAddr, id);
    }

    /**
     * @dev Settle the trading of VIP-210/ERC-1155 tokens
     * @param seller [address]
     * @param buyer [address]
     * @param ftAddr [address] FT contract address
     * @param value [uint256] trade value
     * @param nftAddr [address] NFT contract address
     * @param id [uint256] NFT token ID
     * @param amount [uint256] NFT token amount
     * @param data [bytes] Extra data (optional)
     * @param psAddr [address] ProfitSharing contract address
     */
    function settle(
        address seller,
        address buyer,
        address ftAddr,
        uint256 value,
        address nftAddr,
        uint256 id,
        uint256 amount,
        bytes memory data,
        address psAddr
    ) public isOwner checkAddrs(seller, buyer, ftAddr, nftAddr) {
        _transferNFT(seller, buyer, nftAddr, id, amount, data);

        _transferFT(seller, buyer, nftAddr, id, ftAddr, value, psAddr);

        emit Settle(seller, buyer, ftAddr, value, nftAddr, id, amount);
    }

    event Settle(
        address indexed seller,
        address indexed buyer,
        address ftAddr,
        uint256 value,
        address nftAddr,
        uint256 tokenId
    );

    event Settle(
        address indexed seller,
        address indexed buyer,
        address ftAddr,
        uint256 value,
        address nftAddr,
        uint256 tokenId,
        uint256 amount
    );

    function _transferNFT(
        address seller,
        address buyer,
        address nftAddr,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) internal {
        if (amount == 0) {
            IERC721(nftAddr).safeTransferFrom(seller, buyer, id, data);
        } else {
            IERC1155(nftAddr).safeTransferFrom(seller, buyer, id, amount, data);
        }
    }

    function _transferFT(
        address seller,
        address buyer,
        address nftAddr,
        uint256 id,
        address ftAddr,
        uint256 value,
        address psAddr
    ) internal {
        uint256 deduct;

        if (psAddr != address(0)) {
            address[] memory beneficiary;
            uint256[] memory amount;
            (beneficiary, amount) = IProfitSharing(psAddr).cal(
                value,
                nftAddr,
                id
            );

            for (uint256 i = 0; i < beneficiary.length; i++) {
                if (amount[i] == 0) {
                    continue;
                }
                deduct += amount[i];
                IERC20(ftAddr).transferFrom(buyer, beneficiary[i], amount[i]);
            }
        }

        require(
            deduct <= value,
            "Amount transfered to the beneficiaries more than the total transfer value"
        );

        IERC20(ftAddr).transferFrom(buyer, seller, value - deduct);
    }
}
