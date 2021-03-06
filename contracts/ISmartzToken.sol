pragma solidity 0.4.18;


/// @title Interface of the SmartzToken.
interface ISmartzToken {
    // multiowned
    function changeOwner(address _from, address _to) external;
    function addOwner(address _owner) external;
    function removeOwner(address _owner) external;
    function changeRequirement(uint _newRequired) external;
    function getOwner(uint ownerIndex) public view returns (address);
    function getOwners() public view returns (address[]);
    function isOwner(address _addr) public view returns (bool);
    function amIOwner() external view returns (bool);
    function revoke(bytes32 _operation) external;
    function hasConfirmed(bytes32 _operation, address _owner) external view returns (bool);

    // ERC20Basic
    function totalSupply() public view returns (uint256);
    function balanceOf(address who) public view returns (uint256);
    function transfer(address to, uint256 value) public returns (bool);

    // ERC20
    function allowance(address owner, address spender) public view returns (uint256);
    function transferFrom(address from, address to, uint256 value) public returns (bool);
    function approve(address spender, uint256 value) public returns (bool);

    function name() public view returns (string);
    function symbol() public view returns (string);
    function decimals() public view returns (uint8);

    // BurnableToken
    function burn(uint256 _amount) public returns (bool);

    // TokenWithApproveAndCallMethod
    function approveAndCall(address _spender, uint256 _value, bytes _extraData) public;

    // SmartzToken
    function setKYCProvider(address KYCProvider) external;
    function setSale(address account, bool isSale) external;
    function disablePrivileged() external;

    function availableBalanceOf(address _owner) public view returns (uint256);
    function frozenCellCount(address owner) public view returns (uint);
    function frozenCell(address owner, uint index) public view returns (uint amount, uint thawTS, bool isKYCRequired);

    function frozenTransfer(address _to, uint256 _value, uint thawTS, bool isKYCRequired) external returns (bool);
    function frozenTransferFrom(address _from, address _to, uint256 _value, uint thawTS, bool isKYCRequired) external returns (bool);
}
