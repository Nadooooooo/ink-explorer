// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract Approval20 {
  string public symbol = "TEST";
  uint8 public decimals = 6;
  mapping(address => mapping(address => uint256)) public allowance;
  event Approval(address indexed owner, address indexed spender, uint256 value);
  function approve(address spender, uint256 value) external returns(bool) {
    allowance[msg.sender][spender] = value;
    emit Approval(msg.sender, spender, value); return true;
  }
}
contract Approval721 {
  mapping(uint256 => address) public ownerOf;
  mapping(uint256 => address) public getApproved;
  mapping(address => mapping(address => bool)) public isApprovedForAll;
  event Approval(address indexed owner, address indexed spender, uint256 indexed tokenId);
  event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
  constructor() { ownerOf[900719925474099312345] = msg.sender; }
  function supportsInterface(bytes4 i) external pure returns(bool) { return i == 0x80ac58cd; }
  function approve(address spender, uint256 tokenId) external {
    require(ownerOf[tokenId] == msg.sender, "not owner"); getApproved[tokenId] = spender;
    emit Approval(msg.sender, spender, tokenId);
  }
  function setApprovalForAll(address operator, bool approved) external {
    isApprovedForAll[msg.sender][operator] = approved;
    emit ApprovalForAll(msg.sender, operator, approved);
  }
}
contract Approval1155 {
  mapping(address => mapping(address => bool)) public isApprovedForAll;
  event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
  function supportsInterface(bytes4 i) external pure returns(bool) { return i == 0xd9b67a26; }
  function setApprovalForAll(address operator, bool approved) external {
    isApprovedForAll[msg.sender][operator] = approved;
    emit ApprovalForAll(msg.sender, operator, approved);
  }
}
