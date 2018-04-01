pragma solidity 0.4.18;

import 'zeppelin-solidity/contracts/token/ERC20.sol';

import 'mixbytes-solidity/contracts/ownership/multiowned.sol';
import 'mixbytes-solidity/contracts/security/ArgumentsChecker.sol';

import './ISmartzToken.sol';


/**
 * @title Vault tailored for frozen tokens safe and user-friendly distribution.
 *
 * The idea is that this vault simulates ERC20 token, but under the hood issues SMR frozenTransfer.
 */
contract SMRDistributionVault is ArgumentsChecker, multiowned, ERC20 {


    // PUBLIC FUNCTIONS

    function SMRDistributionVault(address[] _initialOwners, address SMR, uint thawTS)
        public
        multiowned(_initialOwners, 1)
    {
        m_SMR = ISmartzToken(SMR);
        m_thawTS = thawTS;

        totalSupply = m_SMR.totalSupply();
    }


    /// @notice Balance of tokens.
    /// @dev Owners are considered to possess all the tokens of this vault.
    function balanceOf(address who) public view returns (uint256) {
        return isOwner(who) ? m_SMR.balanceOf(this) : 0;
    }

    /// @notice Looks like transfer of this token, but actually frozenTransfers SMR.
    function transfer(address to, uint256 value)
        public
        payloadSizeIs(2 * 32)
        onlyowner
        returns (bool)
    {
        return m_SMR.frozenTransfer(to, value, m_thawTS, false);
    }

    /// @notice Transfers using plain transfer remaining tokens.
    function withdrawRemaining(address to)
        external
        payloadSizeIs(1 * 32)
        onlyowner
        returns (bool)
    {
        return m_SMR.transfer(to, m_SMR.balanceOf(this));
    }


    /// @dev There is no need to support this function.
    function allowance(address , address ) public view returns (uint256) {
        revert();
    }

    /// @dev There is no need to support this function.
    function transferFrom(address , address , uint256 ) public returns (bool) {
        revert();
    }

    /// @dev There is no need to support this function.
    function approve(address , uint256 ) public returns (bool) {
        revert();
    }

    function decimals() public view returns (uint8) {
        return m_SMR.decimals();
    }


    // FIELDS

    /// @notice link to the SMR
    ISmartzToken public m_SMR;

    /// @notice Thaw timestamp of frozenTransfers issued by this vault
    uint public m_thawTS;


    // CONSTANTS

    string public constant name = "SMRDistributionVault";
    string public constant symbol = "SMRDW";
}
