// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Interaction {
    uint256 public value;
    error DeliberateFailure(uint256 value);
    struct Pair { uint256 amount; bool enabled; }
    function set(uint256 next) external { value = next; }
    function deposit() external payable { value += msg.value; }
    function fail() external { revert DeliberateFailure(42); }
    function echo(Pair[] calldata pairs, int8 number, bytes4 data) external pure returns (Pair[] memory, int8, bytes4) { return (pairs, number, data); }
    function overload(uint256 n) external pure returns (uint256) { return n; }
    function overload(bool enabled) external pure returns (bool) { return enabled; }
}

contract TestProxy {
    address immutable implementation;
    constructor(address target) { implementation = target; }
    fallback() external payable {
        address target = implementation;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), target, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok case 0 { revert(0, returndatasize()) } default { return(0, returndatasize()) }
        }
    }
}
