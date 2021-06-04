// contracts/nft.sol
// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract TestNFT721 is ERC721 {
    address public owner;

    constructor() ERC721("TestNFT721", "T721") {
        owner = msg.sender;
    }

	function mint(address to, uint256 id) public {
        require(owner != address(0) && owner == msg.sender, "Not permitted to mint");
        _mint(to, id);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
